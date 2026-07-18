import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { logActivity } from "../lib/activity";
import { GoogleAuthError, hasScope } from "./api";
import { CALENDAR_SCOPE, resolveVectorCalendarId } from "./calendar";
import { getAccessToken } from "./auth";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

type SyncCandidate = {
  userId: Id<"users">;
  clerkId: string;
  orgId: Id<"organizations">;
  teamId: Id<"teams">;
};

type CalendarEventItem = {
  id: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};

/** Return one sync candidate per user: their first org and that org's first team. */
export const listSyncCandidates = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      clerkId: v.string(),
      orgId: v.id("organizations"),
      teamId: v.id("teams"),
    })
  ),
  handler: async (ctx): Promise<SyncCandidate[]> => {
    const users = await ctx.db.query("users").collect();
    const candidates: SyncCandidate[] = [];

    for (const user of users) {
      const membership = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();
      if (!membership) continue;

      const team = await ctx.db
        .query("teams")
        .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
        .first();
      if (!team) continue;

      candidates.push({
        userId: user._id,
        clerkId: user.clerkId,
        orgId: membership.orgId,
        teamId: team._id,
      });
    }
    return candidates;
  },
});

/** Create a task from a Google Calendar event that has no vectorIssueId yet. */
export const createIssueFromEvent = internalMutation({
  args: {
    orgId: v.id("organizations"),
    teamId: v.id("teams"),
    userId: v.id("users"),
    title: v.string(),
    dueDate: v.optional(v.number()),
  },
  returns: v.id("issues"),
  handler: async (ctx, args): Promise<Id<"issues">> => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    const number = team.nextIssueNumber;
    await ctx.db.patch(team._id, { nextIssueNumber: number + 1 });

    const newest = await ctx.db
      .query("issues")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .first();
    const sortOrder = (newest?.sortOrder ?? 0) + 1000;

    const issueId = await ctx.db.insert("issues", {
      orgId: args.orgId,
      teamId: args.teamId,
      number,
      title: args.title.trim(),
      status: "todo",
      priority: "none",
      assigneeId: args.userId,
      creatorId: args.userId,
      dueDate: args.dueDate,
      sortOrder,
    });

    await logActivity(ctx, {
      orgId: args.orgId,
      issueId,
      actorId: args.userId,
      type: "created",
    });

    return issueId;
  },
});

/** Update an existing task whose linked Google event changed title or date. */
export const applyEventToIssue = internalMutation({
  args: {
    issueId: v.id("issues"),
    title: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    actorId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) return null;

    const updates: { title?: string; dueDate?: number } = {};
    const changes: { field: string; oldValue?: string; newValue?: string }[] = [];

    if (args.title !== undefined && args.title.trim() !== issue.title) {
      updates.title = args.title.trim();
      changes.push({ field: "title", oldValue: issue.title, newValue: updates.title });
    }
    if (args.dueDate !== undefined && args.dueDate !== issue.dueDate) {
      updates.dueDate = args.dueDate;
      changes.push({
        field: "dueDate",
        oldValue: issue.dueDate?.toString(),
        newValue: args.dueDate.toString(),
      });
    }

    if (Object.keys(updates).length === 0) return null;

    await ctx.db.patch(issue._id, updates);
    for (const change of changes) {
      await logActivity(ctx, {
        orgId: issue.orgId,
        issueId: issue._id,
        actorId: args.actorId,
        type: `${change.field}_changed`,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }
    return null;
  },
});

/** Stamp a Google Calendar event with the Vector issue id so it's recognised on future polls. */
async function stampEventWithIssueId(
  accessToken: string,
  calendarId: string,
  eventId: string,
  issueId: string
): Promise<void> {
  await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        extendedProperties: { private: { vectorIssueId: issueId } },
      }),
    }
  );
}

/** Parse an event's start date (all-day or timed) into ms since epoch. */
function parseEventDate(
  start: { date?: string; dateTime?: string } | undefined
): number | undefined {
  if (!start) return undefined;
  const raw = start.dateTime ?? start.date;
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Poll all users' "Vector Tasks" calendars for recent changes and sync them
 * into the app. Cron fires this every 5 minutes; we look back 10 minutes so
 * the windows always overlap and nothing slips through.
 */
export const pollAllCalendars = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const candidates = await ctx.runQuery(
      internal.google.sync.listSyncCandidates,
      {}
    );

    const updatedMin = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    for (const candidate of candidates) {
      let token: string;
      let scopes: string[];
      try {
        const result = await ctx.runAction(
          internal.google.auth.getAccessToken,
          { clerkUserId: candidate.clerkId }
        );
        token = result.token;
        scopes = result.scopes;
      } catch (error) {
        if (error instanceof GoogleAuthError && error.reconnectRequired) {
          continue;
        }
        console.error(
          `Calendar poll: token fetch failed for ${candidate.clerkId}`,
          error
        );
        continue;
      }

      if (!hasScope({ token, scopes }, CALENDAR_SCOPE)) {
        continue;
      }

      let calendarId: string;
      try {
        calendarId = await resolveVectorCalendarId(token);
      } catch {
        continue;
      }

      const params = new URLSearchParams({
        updatedMin,
        singleEvents: "true",
        showDeleted: "true",
        maxResults: "100",
      });
      const eventsRes = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!eventsRes.ok) {
        continue;
      }
      const eventsBody = (await eventsRes.json()) as {
        items?: CalendarEventItem[];
      };
      const events = eventsBody.items ?? [];

      for (const event of events) {
        if (!event.id) continue;

        const existingIssueId =
          event.extendedProperties?.private?.vectorIssueId;

        if (existingIssueId) {
          // App-owned or previously imported event: apply updates, skip deletes.
          if (event.status === "cancelled") continue;

          const dueDate = parseEventDate(event.start);
          await ctx.runMutation(internal.google.sync.applyEventToIssue, {
            issueId: existingIssueId as Id<"issues">,
            title: event.summary,
            dueDate,
            actorId: candidate.userId,
          });
        } else {
          // User-created event with no Vector marker: import as a new task.
          if (event.status === "cancelled") continue;

          const dueDate = parseEventDate(event.start);
          const title = event.summary?.trim() || "(Untitled event)";

          const newIssueId = await ctx.runMutation(
            internal.google.sync.createIssueFromEvent,
            {
              orgId: candidate.orgId,
              teamId: candidate.teamId,
              userId: candidate.userId,
              title,
              dueDate,
            }
          );

          // Stamp the event so we never re-import it.
          await stampEventWithIssueId(token, calendarId, event.id, newIssueId);
        }
      }
    }

    return null;
  },
});
