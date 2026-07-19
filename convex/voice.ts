import { generateText } from "ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  chatModel,
  isAiConfigured,
} from "./agent/models";

/**
 * Voice assistant backend for the hands-free "Vector" wake-word assistant.
 *
 * The browser handles wake-word detection + speech-to-text for free (Web Speech
 * API). Once it hears "vector", it sends the transcribed command here:
 *   - `reply`  — DeepSeek (the existing chat model) produces a spoken-style answer.
 *   - `speak`  — Deepgram Aura turns that answer into audio.
 *
 * Both are authenticated + plan-gated through `internal.agent.data.authorizeAi`
 * (JWT-derived org, never client input), matching the triage actions. The
 * Deepgram key lives only on the Convex deployment, never in the browser.
 */

const failure = v.object({ ok: v.literal(false), error: v.string() });

// Keep replies short and plain — they are read aloud by TTS.
const VOICE_SYSTEM = `You are Vector, a friendly voice assistant. You are speaking to the user through a text-to-speech system, so:
- Respond in plain text only. Never use markdown, lists, tables, code, or emojis.
- Keep replies brief: one to three sentences.
- Spell out awkward abbreviations and omit "https://" when saying a web address.
- Be warm and answer the user's actual question directly.`;

const chatMessage = v.object({
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
});

/** Generate a short, spoken-style reply to a voice command. */
export const reply = action({
  args: {
    prompt: v.string(),
    history: v.optional(v.array(chatMessage)),
  },
  returns: v.union(
    failure,
    v.object({ ok: v.literal(true), text: v.string() })
  ),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.agent.data.authorizeAi, {});
    if (!isAiConfigured()) {
      return { ok: false as const, error: AI_NOT_CONFIGURED_MESSAGE };
    }

    const prompt = args.prompt.trim();
    if (!prompt) {
      return { ok: false as const, error: "I didn't catch that." };
    }

    try {
      const { text } = await generateText({
        model: chatModel,
        system: VOICE_SYSTEM,
        messages: [
          ...(args.history ?? []),
          { role: "user" as const, content: prompt },
        ],
      });

      const answer = text.trim();
      if (!answer) {
        return { ok: false as const, error: "I don't have a reply for that." };
      }
      return { ok: true as const, text: answer };
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
