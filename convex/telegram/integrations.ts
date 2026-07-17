import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { getAuthContext } from "../lib/auth";
import { orgMutation, orgQuery } from "../lib/customFunctions";
import { deleteWebhook, getMe, setWebhook } from "./api";

/**
 * Telegram integration lifecycle (connect / disconnect / status / link codes).
 *
 * The bot token is provided by an org admin through the app UI and stored on a
 * per-org `telegramIntegrations` row. `connect`/`disconnect` must call the
 * Telegram HTTP API, so they are actions that (1) resolve + gate the caller via
 * an internal query, (2) talk to Telegram, then (3) persist via an internal
 * mutation. The token and webhook secret are never returned to the client.
 */

const LINK_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Resolve the Convex HTTP endpoint host for webhook registration. */
function webhookUrl(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL is not set on the Convex deployment");
  }
  return `${siteUrl}/telegram-webhook`;
}

/** Random URL-safe token via the Web Crypto API (available in Convex runtime). */
function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Internal auth + persistence (called from the actions below) ─────────────

/** Resolve the caller and require org-admin — actions have no db access. */
export const authorizeAdmin = internalQuery({
  args: {},
  returns: v.object({
    orgId: v.id("organizations"),
    userId: v.id("users"),
  }),
  handler: async (ctx) => {
    const { org, user, membership } = await getAuthContext(ctx);
    if (membership.role !== "admin") {
      throw new Error("Only workspace admins can manage integrations");
    }
    return { orgId: org._id, userId: user._id };
  },
});

export const saveIntegration = internalMutation({
  args: {
    orgId: v.id("organizations"),
    userId: v.id("users"),
    botToken: v.string(),
    botUsername: v.optional(v.string()),
    webhookSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("telegramIntegrations")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    const patch = {
      botToken: args.botToken,
      botUsername: args.botUsername,
      webhookSecret: args.webhookSecret,
      connectedBy: args.userId,
      active: true,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("telegramIntegrations", {
        orgId: args.orgId,
        ...patch,
      });
    }
    return null;
  },
});

/** Read the raw integration (token included) — INTERNAL only. */
export const getIntegrationInternal = internalQuery({
  args: { orgId: v.id("organizations") },
  returns: v.union(
    v.object({
      botToken: v.string(),
      botUsername: v.optional(v.string()),
      active: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramIntegrations")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    if (!row) {
      return null;
    }
    return {
      botToken: row.botToken,
      botUsername: row.botUsername,
      active: row.active,
    };
  },
});

export const markDisconnected = internalMutation({
  args: { orgId: v.id("organizations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramIntegrations")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { active: false });
    }
    return null;
  },
});

// ── Public actions (connect / disconnect) ───────────────────────────────────

export const connect = action({
  args: { botToken: v.string() },
  returns: v.object({ botUsername: v.string() }),
  handler: async (ctx, args): Promise<{ botUsername: string }> => {
    const { orgId, userId } = await ctx.runQuery(
      internal.telegram.integrations.authorizeAdmin,
      {}
    );

    const token = args.botToken.trim();
    if (!token) {
      throw new Error("Bot token is required");
    }

    // Validate the token by asking Telegram who the bot is.
    const bot = await getMe(token);
    const botUsername = bot.username ?? "";

    // Register our webhook with a fresh secret Telegram will echo back.
    const webhookSecret = randomToken();
    await setWebhook(token, webhookUrl(), webhookSecret);

    await ctx.runMutation(internal.telegram.integrations.saveIntegration, {
      orgId,
      userId,
      botToken: token,
      botUsername,
      webhookSecret,
    });

    return { botUsername };
  },
});

export const disconnect = action({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const { orgId } = await ctx.runQuery(
      internal.telegram.integrations.authorizeAdmin,
      {}
    );
    const integration = await ctx.runQuery(
      internal.telegram.integrations.getIntegrationInternal,
      { orgId }
    );
    if (integration) {
      // Best-effort: stop Telegram from delivering further updates.
      try {
        await deleteWebhook(integration.botToken);
      } catch (error) {
        console.error("Failed to delete Telegram webhook", error);
      }
    }
    await ctx.runMutation(internal.telegram.integrations.markDisconnected, {
      orgId,
    });
    return null;
  },
});

// ── Public queries / mutations for the settings UI ──────────────────────────

/** Safe connection status — never exposes the bot token or webhook secret. */
export const getIntegrationStatus = orgQuery({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    active: v.boolean(),
    botUsername: v.union(v.string(), v.null()),
    linked: v.boolean(),
  }),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("telegramIntegrations")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .unique();
    const link = await ctx.db
      .query("telegramLinks")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id)
      )
      .first();
    return {
      connected: row !== null,
      active: row?.active ?? false,
      botUsername: row?.botUsername ?? null,
      linked: link !== null,
    };
  },
});

/**
 * Create a one-time code and return the `t.me` deep link the current user taps
 * to link their own Telegram account to this (org, user).
 */
export const createLinkCode = orgMutation({
  args: {},
  returns: v.object({ deepLink: v.string() }),
  handler: async (ctx): Promise<{ deepLink: string }> => {
    const integration = await ctx.db
      .query("telegramIntegrations")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .unique();
    if (!integration || !integration.active || !integration.botUsername) {
      throw new Error("Connect a Telegram bot for this workspace first");
    }

    // Clear any prior codes for this user so only the newest is valid.
    const prior = await ctx.db
      .query("telegramLinkCodes")
      // eslint-disable-next-line @convex-dev/no-filter-in-query
      .filter((q) => q.eq(q.field("userId"), ctx.user._id))
      .collect();
    for (const code of prior) {
      if (code.orgId === ctx.org._id) {
        await ctx.db.delete(code._id);
      }
    }

    const code = randomToken();
    await ctx.db.insert("telegramLinkCodes", {
      orgId: ctx.org._id,
      userId: ctx.user._id,
      code,
      expiresAt: Date.now() + LINK_CODE_TTL_MS,
    });

    return {
      deepLink: `https://t.me/${integration.botUsername}?start=${code}`,
    };
  },
});
