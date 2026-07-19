import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled Telegram digests: morning / afternoon / evening.
 *
 * Convex crons fire in UTC and the app stores no per-user timezone, so we anchor
 * the three slots to a single workspace-local timezone via an offset (minutes
 * east of UTC). Default is IST (UTC+5:30 = 330). Override per deployment with the
 * DIGEST_UTC_OFFSET_MINUTES environment variable, e.g. 240 for the Gulf (UTC+4).
 */

const DEFAULT_OFFSET_MINUTES = 330; // IST (UTC+05:30)

function offsetMinutes(): number {
  const raw = process.env.DIGEST_UTC_OFFSET_MINUTES;
  if (raw === undefined) {
    return DEFAULT_OFFSET_MINUTES;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_OFFSET_MINUTES;
}

/** Convert a local wall-clock time to the equivalent UTC hour/minute. */
function toUtc(localHour: number, localMinute: number): {
  hourUTC: number;
  minuteUTC: number;
} {
  const totalUtc =
    (localHour * 60 + localMinute - offsetMinutes() + 24 * 60) % (24 * 60);
  return {
    hourUTC: Math.floor(totalUtc / 60),
    minuteUTC: totalUtc % 60,
  };
}

const crons = cronJobs();

// ~7:30 local — "due soon" reminder pushed to every assignee whose issue is
// due within the next 36 hours (covers today + early tomorrow). Fires before
// the morning digest so members see the nudge first.
crons.daily(
  "due-date-reminders",
  toUtc(7, 30),
  internal.dueDateReminders.runReminders,
  {}
);

// ~8:00 local — overnight recap.
crons.daily(
  "telegram-digest-morning",
  toUtc(8, 0),
  internal.digest.runDigests,
  { slot: "morning" }
);

// ~13:00 local — afternoon update.
crons.daily(
  "telegram-digest-afternoon",
  toUtc(13, 0),
  internal.digest.runDigests,
  { slot: "afternoon" }
);

// ~18:00 local — evening wrap-up.
crons.daily(
  "telegram-digest-evening",
  toUtc(18, 0),
  internal.digest.runDigests,
  { slot: "evening" }
);

// Poll every connected user's "Vector Tasks" Google Calendar for new/changed
// events and sync them into the app. Interval overlaps are handled in the
// action itself (10-min lookback window vs 5-min fire cadence).
crons.interval(
  "calendar-google-poll",
  { minutes: 5 },
  internal.google.sync.pollAllCalendars,
  {}
);

export default crons;
