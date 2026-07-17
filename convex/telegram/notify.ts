import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { formatAssignment, formatNewIssue } from "./format";

/**
 * Outbound push notifications to linked Telegram chats.
 *
 * These are internal functions scheduled from feature mutations (e.g. issue
 * assignment). They resolve the target user's linked chats and hand off the
 * actual Telegram API call to `telegram.bot.sendText`.
 */

/** Send an arbitrary message to every chat a user has linked in an org. */
export const notifyUser = internalMutation({
  args: {
    orgId: v.id("organizations"),
    userId: v.id("users"),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const integration = await ctx.db
      .query("telegramIntegrations")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    if (!integration || !integration.active) {
      return null;
    }
    const links = await ctx.db
      .query("telegramLinks")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", args.orgId).eq("userId", args.userId)
      )
      .collect();
    for (const link of links) {
      await ctx.scheduler.runAfter(0, internal.telegram.bot.sendText, {
        orgId: args.orgId,
        chatId: link.telegramChatId,
        text: args.text,
      });
    }
    return null;
  },
});

/**
 * Send a message to EVERY chat linked anywhere in an org (all members). Used for
 * workspace-wide announcements such as new-task broadcasts. No-ops silently if
 * the integration is missing or inactive.
 */
export const broadcastToOrg = internalMutation({
  args: {
    orgId: v.id("organizations"),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const integration = await ctx.db
      .query("telegramIntegrations")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    if (!integration || !integration.active) {
      return null;
    }
    // The by_org_and_user index is prefixed by orgId, so an eq on just orgId
    // returns every linked chat in the org without touching the schema.
    const links = await ctx.db
      .query("telegramLinks")
      .withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const link of links) {
      await ctx.scheduler.runAfter(0, internal.telegram.bot.sendText, {
        orgId: args.orgId,
        chatId: link.telegramChatId,
        text: args.text,
      });
    }
    return null;
  },
});

/** Chat ids linked in an org — used by the scheduled digest action. */
export const orgTelegramChats = internalQuery({
  args: { orgId: v.id("organizations") },
  returns: v.array(v.number()),
  handler: async (ctx, args): Promise<number[]> => {
    const integration = await ctx.db
      .query("telegramIntegrations")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    if (!integration || !integration.active) {
      return [];
    }
    const links = await ctx.db
      .query("telegramLinks")
      .withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId))
      .collect();
    return links.map((link) => link.telegramChatId);
  },
});

/**
 * Announce a newly-created issue to the whole workspace over Telegram.
 * Scheduled from `issues.create` (and the agent's create tool) for every new
 * task, whether or not it has an assignee. No-ops if nobody has linked Telegram.
 */
export const onIssueCreated = internalMutation({
  args: {
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    actorId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.orgId !== args.orgId) {
      return null;
    }
    const team = await ctx.db.get(issue.teamId);
    const creator = await ctx.db.get(args.actorId);
    const assignee = issue.assigneeId
      ? await ctx.db.get(issue.assigneeId)
      : null;
    const text = formatNewIssue(
      issue,
      team?.key ?? "?",
      creator?.name ?? "someone",
      assignee?.name ?? null
    );
    await ctx.runMutation(internal.telegram.notify.broadcastToOrg, {
      orgId: args.orgId,
      text,
    });
    return null;
  },
});

/**
 * Notify a user that an issue was assigned to them. Scheduled from
 * `issues.update` when the assignee changes. No-ops silently if the assignee
 * has no Telegram linked or is the one who made the change.
 */
export const onIssueAssigned = internalMutation({
  args: {
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    assigneeId: v.id("users"),
    actorId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // Don't notify people about their own assignments.
    if (args.assigneeId === args.actorId) {
      return null;
    }
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.orgId !== args.orgId) {
      return null;
    }
    const team = await ctx.db.get(issue.teamId);
    const actor = await ctx.db.get(args.actorId);
    const text = formatAssignment(
      issue,
      team?.key ?? "?",
      actor?.name ?? "someone"
    );
    await ctx.runMutation(internal.telegram.notify.notifyUser, {
      orgId: args.orgId,
      userId: args.assigneeId,
      text,
    });
    return null;
  },
});
