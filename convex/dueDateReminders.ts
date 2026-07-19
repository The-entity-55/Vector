import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";
import { formatDueDateReminder } from "./telegram/format";

/**
 * Due-date reminder system.
 *
 * Runs once a day at ~07:30 local (see crons.ts) and sends a personalized
 * Telegram message to every assignee whose non-completed issue is due within
 * the next 36 hours. Unassigned issues are broadcast to the whole org.
 * Everything no-ops silently if no Telegram integration is active.
 *
 * Architecture note: we use the existing `by_org` index + in-memory filter
 * rather than modifying the frozen schema. Issue counts per org are well within
 * Convex's take() limit for typical workspaces.
 */

// ── Data layer ────────────────────────────────────────────────────────────────

export const issuesDueSoon = internalQuery({
  args: {
    orgId: v.id("organizations"),
    /** How many milliseconds into the future to look. */
    windowMs: v.number(),
  },
  returns: v.array(
    v.object({
      issueId: v.id("issues"),
      identifier: v.string(),
      title: v.string(),
      dueDate: v.number(),
      assigneeId: v.union(v.id("users"), v.null()),
      assigneeName: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = now + args.windowMs;

    const allIssues = await ctx.db
      .query("issues")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();

    type DueSoonIssue = {
      issueId: Id<"issues">;
      identifier: string;
      title: string;
      dueDate: number;
      assigneeId: Id<"users"> | null;
      assigneeName: string | null;
    };

    const result: DueSoonIssue[] = [];
    const teamKeyCache = new Map<string, string>();

    for (const issue of allIssues) {
      // Skip completed / canceled / no due date.
      if (
        issue.dueDate === undefined ||
        issue.status === "done" ||
        issue.status === "canceled"
      ) {
        continue;
      }

      // Only issues whose due date falls in [now, now + windowMs].
      if (issue.dueDate < now || issue.dueDate > cutoff) {
        continue;
      }

      let teamKey = teamKeyCache.get(issue.teamId);
      if (teamKey === undefined) {
        const team = await ctx.db.get(issue.teamId);
        teamKey = team?.key ?? "?";
        teamKeyCache.set(issue.teamId, teamKey);
      }

      let assigneeName: string | null = null;
      if (issue.assigneeId) {
        const assignee = await ctx.db.get(issue.assigneeId);
        assigneeName = assignee?.name ?? null;
      }

      result.push({
        issueId: issue._id,
        identifier: `${teamKey}-${issue.number}`,
        title: issue.title,
        dueDate: issue.dueDate,
        assigneeId: issue.assigneeId ?? null,
        assigneeName,
      });
    }

    // Sort by dueDate ascending — most urgent first.
    result.sort((a, b) => a.dueDate - b.dueDate);
    return result;
  },
});

// ── Orchestration ─────────────────────────────────────────────────────────────

/**
 * Entry point called by the daily cron. Iterates every org with an active
 * Telegram integration, finds issues due within the next 36 hours, and sends
 * a personalized reminder to each assignee. Unassigned issues are broadcast
 * org-wide. Empty windows are skipped silently.
 */
export const runReminders = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const orgIds: Id<"organizations">[] = await ctx.runQuery(
      internal.telegram.integrations.listActiveIntegrationOrgs,
      {}
    );

    for (const orgId of orgIds) {
      const issues = await ctx.runQuery(
        internal.dueDateReminders.issuesDueSoon,
        { orgId, windowMs: 36 * 60 * 60 * 1000 } // 36-hour window
      );

      if (issues.length === 0) continue;

      // Group by assignee. Unassigned issues share the null key.
      const byAssignee = new Map<
        Id<"users"> | null,
        typeof issues
      >();
      for (const issue of issues) {
        const key = issue.assigneeId;
        const bucket = byAssignee.get(key) ?? [];
        bucket.push(issue);
        byAssignee.set(key, bucket);
      }

      for (const [assigneeId, assigneeIssues] of byAssignee.entries()) {
        const text = formatDueDateReminder(assigneeIssues);

        if (assigneeId === null) {
          // Unassigned — broadcast to every linked chat in the org.
          await ctx.scheduler.runAfter(
            0,
            internal.telegram.notify.broadcastToOrg,
            { orgId, text }
          );
        } else {
          // Assigned — notify only that member.
          await ctx.scheduler.runAfter(
            0,
            internal.telegram.notify.notifyUser,
            { orgId, userId: assigneeId, text }
          );
        }
      }
    }

    return null;
  },
});
