import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { formatAssignment } from "./format";

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
