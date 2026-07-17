import {
  createThread as createAgentThread,
  saveMessage,
} from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import {
  MutationCtx,
  internalAction,
  internalMutation,
} from "../_generated/server";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  assertAiConfigured,
  isAiConfigured,
} from "../agent/models";
import { threadUserKey } from "../agent/limiter";
import { VECTOR_INSTRUCTIONS, vectorAgent } from "../agent/vectorAgent";
import {
  actorContextText,
  formatHelp,
  formatProjects,
  formatStandup,
  formatUnlinked,
} from "./format";
import { sendMessage } from "./api";

/**
 * Telegram ↔ Vector agent bridge.
 *
 * `handleUpdate` (mutation) is the single entry point the webhook calls. It
 * verifies the secret, resolves which (org, user) the chat belongs to via
 * `telegramLinks`, performs any DB work, and schedules an action for anything
 * that must call the Telegram API or the LLM (mutations can do neither).
 *
 * Identity is resolved server-side from the link table — never from message
 * content — mirroring how the web chat injects org/user into the agent ctx.
 */

const STANDUP_WINDOW_HOURS = 24;

type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    from?: { username?: string };
    text?: string;
  };
};

export const handleUpdate = internalMutation({
  args: { update: v.any(), secret: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const update = args.update as TelegramUpdate;
    const message = update.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();
    if (typeof chatId !== "number" || !text) {
      return null; // Non-text update (photo, edited message, etc.) — ignore.
    }

    // Authenticate the webhook: the secret must match a live integration.
    if (!args.secret) {
      return null;
    }
    const integration = await ctx.db
      .query("telegramIntegrations")
      .withIndex("by_webhook_secret", (q) =>
        q.eq("webhookSecret", args.secret as string)
      )
      .unique();
    if (!integration || !integration.active) {
      return null; // Forged or stale webhook call.
    }
    const orgId = integration.orgId;

    const send = (body: string) =>
      ctx.scheduler.runAfter(0, internal.telegram.bot.sendText, {
        orgId,
        chatId,
        text: body,
      });

    // ── /start <code>: link this chat to a Vector account ──────────────────
    if (text.startsWith("/start")) {
      const code = text.slice("/start".length).trim();
      if (!code) {
        await send(
          "Open Vector → Settings → Integrations and tap *Connect my Telegram* to link your account."
        );
        return null;
      }
      await linkChat(ctx, {
        orgId,
        chatId,
        code,
        telegramUsername: message?.from?.username,
      });
      return null;
    }

    // ── Everything else requires a linked account ──────────────────────────
    const link = await ctx.db
      .query("telegramLinks")
      .withIndex("by_chat", (q) => q.eq("telegramChatId", chatId))
      .unique();
    // Security check: Verify that this Telegram chat link belongs to the org that owns this bot webhook.
    // This strictly protects against cross-org access by verifying link.orgId matches the webhook's authenticated orgId.
    if (!link || link.orgId !== orgId) {
      await send(formatUnlinked(integration.botUsername));
      return null;
    }

    // ── Slash commands (delegated to an action that can read reports) ──────
    if (text.startsWith("/")) {
      const command = text.slice(1).split(/\s+/)[0].toLowerCase();
      if (command === "help") {
        await send(formatHelp());
        return null;
      }
      if (command === "projects" || command === "standup") {
        await ctx.scheduler.runAfter(0, internal.telegram.bot.runCommand, {
          orgId,
          chatId,
          command,
        });
        return null;
      }
      if (command === "link") {
        await send(
          "You're already linked. Manage the connection in Vector → Settings → Integrations."
        );
        return null;
      }
      await send("Unknown command. Send /help to see what I can do.");
      return null;
    }

    // ── Plain chat → hand off to the Vector agent ──────────────────────────
    let threadId = link.threadId;
    if (!threadId) {
      threadId = await createAgentThread(ctx, components.agent, {
        userId: threadUserKey(orgId, link.userId),
        title: "Telegram",
      });
      await ctx.db.patch(link._id, { threadId });
    }

    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: threadUserKey(orgId, link.userId),
      prompt: text,
    });

    await ctx.scheduler.runAfter(0, internal.telegram.bot.respond, {
      orgId,
      userId: link.userId,
      chatId,
      threadId,
      promptMessageId: messageId,
    });
    return null;
  },
});

/** Consume a one-time code and (re)link the chat, then confirm. */
async function linkChat(
  ctx: MutationCtx,
  args: {
    orgId: Id<"organizations">;
    chatId: number;
    code: string;
    telegramUsername?: string;
  }
): Promise<void> {
  const send = (body: string) =>
    ctx.scheduler.runAfter(0, internal.telegram.bot.sendText, {
      orgId: args.orgId,
      chatId: args.chatId,
      text: body,
    });

  const codeRow = await ctx.db
    .query("telegramLinkCodes")
    .withIndex("by_code", (q) => q.eq("code", args.code))
    .unique();
  if (
    !codeRow ||
    codeRow.orgId !== args.orgId ||
    codeRow.expiresAt < Date.now()
  ) {
    if (codeRow) {
      await ctx.db.delete(codeRow._id);
    }
    await send(
      "That link code is invalid or has expired. Generate a new one in Vector → Settings → Integrations."
    );
    return;
  }

  // One code is single-use.
  await ctx.db.delete(codeRow._id);

  // A chat maps to exactly one account: replace any prior link for this chat.
  const existing = await ctx.db
    .query("telegramLinks")
    .withIndex("by_chat", (q) => q.eq("telegramChatId", args.chatId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      orgId: args.orgId,
      userId: codeRow.userId,
      telegramUsername: args.telegramUsername,
      // Drop any thread from a previous account so histories never mix.
      threadId: undefined,
    });
  } else {
    await ctx.db.insert("telegramLinks", {
      orgId: args.orgId,
      userId: codeRow.userId,
      telegramChatId: args.chatId,
      telegramUsername: args.telegramUsername,
    });
  }

  const who = await ctx.db.get(codeRow.userId);
  const org = await ctx.db.get(args.orgId);
  await send(
    `✅ Linked as *${who?.name ?? "your account"}* in *${org?.name ?? "your workspace"}*.\n\nAsk me anything about your work, or send /help.`
  );
}

// ── Actions (Telegram API + LLM) ────────────────────────────────────────────

/** Deliver a pre-computed message to a chat using the org's bot token. */
export const sendText = internalAction({
  args: {
    orgId: v.id("organizations"),
    chatId: v.number(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const integration = await ctx.runQuery(
      internal.telegram.integrations.getIntegrationInternal,
      { orgId: args.orgId }
    );
    if (!integration || !integration.active) {
      return null;
    }
    await sendMessage(integration.botToken, args.chatId, args.text);
    return null;
  },
});

/** Run a slash command that needs report data, then send the result. */
export const runCommand = internalAction({
  args: {
    orgId: v.id("organizations"),
    chatId: v.number(),
    command: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    let text: string;
    if (args.command === "projects") {
      const projects = await ctx.runQuery(
        internal.agent.data.listProjectStatus,
        { orgId: args.orgId }
      );
      text = formatProjects(projects);
    } else if (args.command === "standup") {
      const standup = await ctx.runQuery(internal.agent.data.standupForOrg, {
        orgId: args.orgId,
        sinceHours: STANDUP_WINDOW_HOURS,
      });
      text = formatStandup(standup);
    } else {
      text = "Unknown command. Send /help to see what I can do.";
    }
    await ctx.runAction(internal.telegram.bot.sendText, {
      orgId: args.orgId,
      chatId: args.chatId,
      text,
    });
    return null;
  },
});

/**
 * Generate the Vector agent's reply (non-streaming) and send it to Telegram.
 * Mirrors the web `streamResponse`: org/user are injected into the agent ctx so
 * every tool runs correctly scoped; failures leave a graceful message.
 */
export const respond = internalAction({
  args: {
    orgId: v.id("organizations"),
    userId: v.id("users"),
    chatId: v.number(),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const actor = await ctx.runQuery(internal.agent.data.actorContext, {
      orgId: args.orgId,
      userId: args.userId,
    });
    let reply: string;
    try {
      assertAiConfigured();
      const result = await vectorAgent.generateText(
        { ...ctx, orgId: args.orgId, requestUserId: args.userId },
        {
          threadId: args.threadId,
          userId: threadUserKey(args.orgId, args.userId),
        },
        {
          promptMessageId: args.promptMessageId,
          system: `${VECTOR_INSTRUCTIONS}\n\n${actorContextText(actor.orgName, actor.userName)}`,
        }
      );
      reply = result.text?.trim() || "…";
    } catch (error) {
      console.error("Telegram AI response failed", error);
      reply = isAiConfigured()
        ? "Something went wrong while generating a response. Please try again."
        : AI_NOT_CONFIGURED_MESSAGE;
    }
    await ctx.runAction(internal.telegram.bot.sendText, {
      orgId: args.orgId,
      chatId: args.chatId,
      text: reply,
    });
    return null;
  },
});
