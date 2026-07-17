import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { DigestSlot, formatDigest } from "./telegram/format";

/**
 * Scheduled workspace digests pushed to Telegram three times a day
 * (morning / afternoon / evening — see `crons.ts` for the UTC firing times).
 *
 * Each run enumerates every org with an active Telegram integration, builds a
 * recap of what changed since the previous digest, and — when there's anything
 * to report — sends it to every linked chat in that org. Empty windows are
 * skipped so quiet workspaces don't get three empty pings a day.
 */

// Look-back window per slot, in hours. Morning reaches back across the night to
// the previous evening digest; afternoon and evening cover the gap since the
// prior slot. Windows overlap slightly on purpose so nothing slips through.
const SLOT_WINDOW_HOURS: Record<DigestSlot, number> = {
  morning: 14,
  afternoon: 6,
  evening: 6,
};

const slotValidator = v.union(
  v.literal("morning"),
  v.literal("afternoon"),
  v.literal("evening")
);

export const runDigests = internalAction({
  args: { slot: slotValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const windowHours = SLOT_WINDOW_HOURS[args.slot];
    const orgIds = await ctx.runQuery(
      internal.telegram.integrations.listActiveIntegrationOrgs,
      {}
    );

    for (const orgId of orgIds) {
      const chatIds = await ctx.runQuery(
        internal.telegram.notify.orgTelegramChats,
        { orgId }
      );
      if (chatIds.length === 0) {
        continue; // Nobody linked — nothing to send.
      }

      const data = await ctx.runQuery(
        internal.agent.data.orgActivityDigest,
        { orgId, windowHours }
      );
      const text = formatDigest(args.slot, data);
      if (!text) {
        continue; // No activity this window — skip the empty ping.
      }

      for (const chatId of chatIds) {
        await ctx.runAction(internal.telegram.bot.sendText, {
          orgId,
          chatId,
          text,
        });
      }
    }
    return null;
  },
});
