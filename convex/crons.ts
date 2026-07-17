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

export default crons;
