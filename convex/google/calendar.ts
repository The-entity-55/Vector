import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { GoogleAuthError, hasScope } from "./api";

/**
 * Google Calendar integration.
 *
 * A pure `fetch` helper over the Calendar REST API (mirrors `telegram/api.ts`),
 * plus an internal action that resolves a user's Google token (via
 * `google/auth.ts`) and creates an event on their primary calendar. Callers pass
 * the Clerk user id they resolved from an authenticated/ internal context.
 *
 * Calendar API reference:
 * https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
 */

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/** Scope Clerk must have granted for these calls to succeed. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** Minimal Google Calendar event body (all-day or timed). */
export type CalendarEvent = {
  summary: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
};

type CalendarEventResult = {
  id: string;
  htmlLink: string;
};

/**
 * Insert an event on a calendar (defaults to the user's primary). Pure helper:
 * the access token is always passed in, never read here.
 */
export async function insertCalendarEvent(
  accessToken: string,
  event: CalendarEvent,
  calendarId = "primary"
): Promise<CalendarEventResult> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new GoogleAuthError(
      `Calendar event insert failed (${response.status}): ${detail.slice(0, 200)}`,
      // 401/403 typically mean the token lacks the scope or was revoked.
      response.status === 401 || response.status === 403
    );
  }
  const body = (await response.json()) as {
    id?: string;
    htmlLink?: string;
  };
  return { id: body.id ?? "", htmlLink: body.htmlLink ?? "" };
}

/** ms-since-epoch → "YYYY-MM-DD" for the given UTC offset (minutes east). */
function toLocalDateString(ms: number, offsetMinutes: number): string {
  return new Date(ms + offsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

function digestOffsetMinutes(): number {
  const raw = process.env.DIGEST_UTC_OFFSET_MINUTES;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : 330; // default IST
}

/**
 * Create an all-day Calendar event for a task's due date on the user's primary
 * calendar. No-ops (returns null) when Google isn't connected or the calendar
 * scope wasn't granted, so a missing connection never breaks task creation.
 * The date is resolved in the workspace-local timezone (DIGEST_UTC_OFFSET_MINUTES,
 * default IST) so a due date doesn't land on the wrong day.
 */
export const createDueDateEvent = internalAction({
  args: {
    clerkUserId: v.string(),
    identifier: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.number(),
  },
  returns: v.union(
    v.object({ id: v.string(), htmlLink: v.string() }),
    v.null()
  ),
  handler: async (ctx, args): Promise<CalendarEventResult | null> => {
    let tokenInfo: { token: string; scopes: string[] };
    try {
      tokenInfo = await ctx.runAction(internal.google.auth.getAccessToken, {
        clerkUserId: args.clerkUserId,
      });
    } catch (error) {
      if (error instanceof GoogleAuthError && error.reconnectRequired) {
        return null; // Not connected — silently skip.
      }
      throw error;
    }

    if (!hasScope(tokenInfo, CALENDAR_SCOPE)) {
      // User connected Google but not the calendar scope; skip rather than 403.
      return null;
    }

    const offset = digestOffsetMinutes();
    const date = toLocalDateString(args.dueDate, offset);
    // All-day events use an exclusive end date (next day).
    const endDate = toLocalDateString(
      args.dueDate + 24 * 60 * 60 * 1000,
      offset
    );

    return await insertCalendarEvent(tokenInfo.token, {
      summary: `${args.identifier}: ${args.title}`,
      description: args.description,
      start: { date },
      end: { date: endDate },
    });
  },
});
