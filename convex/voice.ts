import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  isAiConfigured,
} from "./agent/models";
import { threadUserKey } from "./agent/limiter";
import { VECTOR_INSTRUCTIONS, vectorAgent } from "./agent/vectorAgent";

/**
 * Voice assistant backend for the hands-free "Vector" wake-word assistant.
 *
 * The browser handles wake-word detection + speech-to-text for free (Web Speech
 * API). Once it hears "vector", it sends the transcribed command here:
 *   - `reply`  — the Vector agent (chat model + workspace tools) produces a
 *                spoken-style answer AND can act on the workspace (create /
 *                update tasks, run reports, search) exactly like the text chat.
 *   - `speak`  — Deepgram Aura turns that answer into audio.
 *
 * The agent runs THREADLESS: the browser keeps the short conversation history
 * client-side and replays it on each turn, so no persisted agent thread is
 * created for voice. Tools receive the server-resolved `orgId` / `requestUserId`
 * through the custom action ctx (never from model output), identical to the
 * text-chat path in `agent/chat.ts`.
 *
 * Both are authenticated + plan-gated through `internal.agent.data.authorizeAi`
 * (JWT-derived org, never client input), matching the triage actions. The
 * Deepgram key lives only on the Convex deployment, never in the browser.
 */

const failure = v.object({ ok: v.literal(false), error: v.string() });

/**
 * Voice flavour of the Vector system prompt. It layers text-to-speech
 * constraints and a spoken confirm-then-act rule on top of the shared
 * `VECTOR_INSTRUCTIONS` (which grants the workspace tools + their usage rules).
 */
const VOICE_VECTOR_SYSTEM = `${VECTOR_INSTRUCTIONS}

You are talking to the user through a hands-free voice interface. Everything you say is read aloud by a text-to-speech system, so:
- Respond in plain text only. Never use markdown, lists, tables, code, or emojis.
- Keep replies brief: one to three sentences.
- Spell out awkward abbreviations and omit "https://" when saying a web address.
- Remember the command was transcribed from speech and may contain small errors; when something is ambiguous, ask a short clarifying question.

Confirming changes over voice (IMPORTANT):
- Reading data — searching tasks, listing teams or members, project or cycle status, standup and other reports — needs no confirmation. Look it up and answer directly.
- Before you change anything (creating a task, or updating a task's title, status, priority, assignee, or dates), first say in one short sentence exactly what you are about to do and ask the user to confirm, for example "I'll create a task called Fix the login bug in Engineering. Shall I go ahead?". Do NOT call the create or update tool on that turn.
- Only after the user confirms on the next turn (for example "yes", "go ahead", "do it") should you call the tool to make the change, then confirm what you did in one sentence and include the identifier, for example "Done, that's ENG-42.".
- If the user declines or changes the request, do not make the change.

Navigating the app:
- You can move the app to a different section or team with the navigate tool when the user asks — for example "switch to projects", "open my tasks", "go to the workspace", "show me cycles", "open settings", or "take me to the Engineering team".
- Navigation is safe and instant, like reading data: do NOT ask for confirmation first. Just call navigate and say a short spoken confirmation such as "Opening Projects." or "Switching to the Engineering team.".
- Fixed sections use the destination values workspace, my-tasks, projects, cycles, ai (the AI agent page) and settings. To open a specific team, discover its key with listTeams if you don't already know it, then pass that teamKey to navigate.`;

const chatMessage = v.object({
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
});

type NavDirective = { path: string; label: string };

/** Pull a navigate directive out of one step's tool-results array. */
function navFromResults(toolResults: unknown): NavDirective | undefined {
  if (!Array.isArray(toolResults)) return undefined;
  let found: NavDirective | undefined;
  for (const entry of toolResults) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { toolName?: unknown; output?: unknown };
    if (record.toolName !== "navigate") continue;
    const output = record.output as
      | { kind?: unknown; path?: unknown; label?: unknown }
      | undefined;
    if (
      output &&
      output.kind === "navigate" &&
      typeof output.path === "string" &&
      typeof output.label === "string"
    ) {
      found = { path: output.path, label: output.label };
    }
  }
  return found;
}

/**
 * Pull the navigation directive out of the agent run, if the `navigate` tool
 * ran. IMPORTANT: `result.toolResults` only holds the LAST step's results, but
 * Vector typically calls navigate in an earlier step and then speaks a
 * confirmation in the final (tool-less) step. So we walk every step and honor
 * the last navigate call. Defensive about shape because the step/result types
 * are loose across the ai-sdk / agent boundary.
 */
function extractNavigate(
  steps: unknown,
  finalToolResults: unknown
): NavDirective | undefined {
  let found: NavDirective | undefined;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const fromStep = navFromResults(
        (step as { toolResults?: unknown }).toolResults
      );
      if (fromStep) found = fromStep;
    }
  }
  // Fall back to the top-level results in case there were no discrete steps.
  return found ?? navFromResults(finalToolResults);
}

/** Generate a short, spoken-style reply to a voice command. */
export const reply = action({
  args: {
    prompt: v.string(),
    history: v.optional(v.array(chatMessage)),
  },
  returns: v.union(
    failure,
    v.object({
      ok: v.literal(true),
      text: v.string(),
      // Present when Vector chose to navigate. The browser turns `path`
      // (relative to the current org) into a real router push.
      navigate: v.optional(v.object({ path: v.string(), label: v.string() })),
    })
  ),
  // The return type is annotated explicitly to break a type-inference cycle:
  // reply → vectorAgent.generateText → tools → `internal`/_generated/api →
  // back to `reply`. Without it TypeScript infers `any` and the cascade shows
  // up as spurious implicit-any errors across the agent modules.
  handler: async (
    ctx,
    args
  ): Promise<
    | { ok: false; error: string }
    | { ok: true; text: string; navigate?: { path: string; label: string } }
  > => {
    // Resolves the caller's org + user from their JWT and enforces plan access.
    // These ids are injected into the tool ctx below — the model never chooses
    // which org/user it operates on.
    const { orgId, userId, orgName, userName } = await ctx.runQuery(
      internal.agent.data.authorizeAi,
      {}
    );
    if (!isAiConfigured()) {
      return { ok: false as const, error: AI_NOT_CONFIGURED_MESSAGE };
    }

    const prompt = args.prompt.trim();
    if (!prompt) {
      return { ok: false as const, error: "I didn't catch that." };
    }

    const today = new Date().toISOString().slice(0, 10);

    try {
      // Threadless: the browser replays the running conversation via `history`,
      // so we pass it as the message list. The agent still requires a `userId`
      // to scope the call, so we reuse the org-scoped chat key — but with
      // `saveMessages: "none"` nothing is persisted; the browser owns history.
      const { text, toolResults, steps } = await vectorAgent.generateText(
        { ...ctx, orgId, requestUserId: userId },
        { userId: threadUserKey(orgId, userId) },
        {
          system: `${VOICE_VECTOR_SYSTEM}\n\nWorkspace: ${orgName}. Requesting user: ${userName}. Today's date: ${today}.`,
          messages: [
            ...(args.history ?? []),
            { role: "user" as const, content: prompt },
          ],
        },
        { storageOptions: { saveMessages: "none" } }
      );

      // If Vector called the `navigate` tool (in any step), surface the
      // directive so the browser can push the route. The agent still speaks a
      // short confirmation ("Opening Projects."), which we return as usual.
      const navigate = extractNavigate(steps, toolResults);
      console.log(
        "[voice.reply] navigate directive:",
        navigate ? JSON.stringify(navigate) : "none"
      );

      const answer = text.trim();
      if (!answer) {
        return { ok: false as const, error: "I don't have a reply for that." };
      }
      return {
        ok: true as const,
        text: answer,
        ...(navigate ? { navigate } : {}),
      };
    } catch (error) {
      console.error("Voice reply generation failed", error);
      return {
        ok: false as const,
        error: "Could not generate a reply. Please try again.",
      };
    }
  },
});

/**
 * Synthesize speech from text via Deepgram Aura. Returns raw MP3 bytes so the
 * browser can play them without exposing the API key.
 */
export const speak = action({
  args: { text: v.string() },
  returns: v.union(
    failure,
    v.object({ ok: v.literal(true), audio: v.bytes() })
  ),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.agent.data.authorizeAi, {});

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        error:
          "Text-to-speech is not configured: DEEPGRAM_API_KEY is missing on the Convex deployment.",
      };
    }

    const text = args.text.trim();
    if (!text) {
      return { ok: false as const, error: "Nothing to speak." };
    }

    // Aura voice model — swap the `model` query param to change the voice.
    // Catalogue: https://developers.deepgram.com/docs/tts-models
    const model = process.env.DEEPGRAM_TTS_MODEL ?? "aura-2-thalia-en";

    try {
      const res = await fetch(
        `https://api.deepgram.com/v1/speak?model=${model}&encoding=mp3`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!res.ok) {
        const detail = await res.text();
        console.error("Deepgram TTS failed", res.status, detail);
        return {
          ok: false as const,
          error: `Text-to-speech failed (${res.status}).`,
        };
      }

      const audio = await res.arrayBuffer();
      return { ok: true as const, audio };
    } catch (error) {
      console.error("Deepgram TTS request errored", error);
      return {
        ok: false as const,
        error: "Could not synthesize speech. Please try again.",
      };
    }
  },
});
