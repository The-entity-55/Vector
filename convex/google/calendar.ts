import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { GoogleAuthError, hasScope } from "./api";

/**
 * Google Calendar integration.
 *
 * Helpers over the Calendar REST API. All event writes stamp
 * `extendedProperties.private.vectorIssueId` so the reverse-sync poller can
 * recognise app-owned events and never re-import them as duplicate tasks.
 */

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/** Full calendar management scope (supersedes the old .events scope). */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export type CalendarEvent = {
  summary: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

type CalendarEventResult = {
  id: string;
  htmlLink: string;
};

type CalendarEventItem = {
  id?: string;
  htmlLink?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};

/**
 * Find or create the "Vector Tasks" calendar on the user's account.
 * Returns the calendar id (not the summary).
 */
export async function resolveVectorCalendarId(
  accessToken: string
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const listRes = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList`, {
    headers,
  });
  if (!listRes.ok) {
    const detail = await listRes.text();
    throw new GoogleAuthError(
      `calendarList fetch failed (${listRes.status}): ${detail.slice(0, 200)}`,
      listRes.status === 401 || listRes.status === 403
    );
  }
  const listBody = (await listRes.json()) as {
    items?: Array<{ id?: string; summary?: string }>;
  };
  const existing = listBody.items?.find(
    (c) => c.summary === "Vector Tasks"
  );
  if (existing?.id) {
    return existing.id;
  }

  // Create it.
  const createRes = await fetch(`${CALENDAR_API_BASE}/calendars`, {
    method: "POST",
    headers,
    body: JSON.stringify({ summary: "Vector Tasks" }),
  });
  if (!createRes.ok) {
    const detail = await createRes.text();
    throw new GoogleAuthError(
      `calendar create failed (${createRes.status}): ${detail.slice(0, 200)}`
    );
  }
  const created = (await createRes.json()) as { id?: string };
  if (!created.id) {
    throw new GoogleAuthError("Calendar create returned no id");
  }
  return created.id;
}

/**
 * Search for an existing calendar event that was created for a specific issue.
 * Uses `privateExtendedProperty` filter so it only matches app-stamped events.
 */
export async function findEventByIssueId(
  accessToken: string,
  calendarId: string,
  issueId: string
): Promise<CalendarEventItem | null> {
  const params = new URLSearchParams({
    privateExtendedProperty: `vectorIssueId=${issueId}`,
    maxResults: "1",
    singleEvents: "true",
  });
  const res = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as { items?: CalendarEventItem[] };
  return body.items?.[0] ?? null;
}

/** Insert an event (used for first-time creation). */
async function insertCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent
): Promise<CalendarEventResult> {
  const res = await fetch(
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
  if (!res.ok) {
    const detail = await res.text();
    throw new GoogleAuthError(
      `Calendar event insert failed (${res.status}): ${detail.slice(0, 200)}`,
      res.status === 401 || res.status === 403
    );
  }
  const body = (await res.json()) as { id?: string; htmlLink?: string };
  return { id: body.id ?? "", htmlLink: body.htmlLink ?? "" };
}

/** Patch an existing event (update summary/dates only). */
async function patchCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: Partial<CalendarEvent>
): Promise<CalendarEventResult> {
  const res = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new GoogleAuthError(
      `Calendar event patch failed (${res.status}): ${detail.slice(0, 200)}`,
      res.status === 401 || res.status === 403
    );
  }
  const body = (await res.json()) as { id?: string; htmlLink?: string };
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
 * Upsert an all-day Calendar event for a task's due date on the user's
 * "Vector Tasks" calendar. Creates on first call; patches on subsequent calls
 * (idempotent via extendedProperties.private.vectorIssueId). No-ops when
 * Google isn't connected or the calendar scope wasn't granted.
 */
export const upsertDueDateEvent = internalAction({
  args: {
    clerkUserId: v.string(),
    issueId: v.string(),
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
        return null;
      }
      throw error;
    }

    if (!hasScope(tokenInfo, CALENDAR_SCOPE)) {
      return null;
    }

    const offset = digestOffsetMinutes();
    const date = toLocalDateString(args.dueDate, offset);
    const endDate = toLocalDateString(
      args.dueDate + 24 * 60 * 60 * 1000,
      offset
    );

    const calendarId = await resolveVectorCalendarId(tokenInfo.token);
    const existing = await findEventByIssueId(
      tokenInfo.token,
      calendarId,
      args.issueId
    );

    const eventBody: CalendarEvent = {
      summary: `${args.identifier}: ${args.title}`,
      description: args.description,
      start: { date },
      end: { date: endDate },
      extendedProperties: {
        private: {
          vectorIssueId: args.issueId,
        },
      },
    };

    if (existing?.id) {
      return await patchCalendarEvent(
        tokenInfo.token,
        calendarId,
        existing.id,
        eventBody
      );
    }
    return await insertCalendarEvent(tokenInfo.token, calendarId, eventBody);
  },
});
