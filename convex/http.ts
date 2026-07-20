import { httpRouter } from "convex/server";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { polar } from "./polar";

const http = httpRouter();

type ClerkEvent = {
  type: string;
  data: Record<string, unknown>;
};

/**
 * Minimal ctx shape shared by the Polar webhook handler's mutation/action ctx —
 * we only need `runMutation` to mirror the plan onto the org.
 */
type RunMutationCtx = {
  runMutation: (
    ref: typeof internal.webhooks.setOrgPlanByClerkOrgId,
    args: {
      clerkOrgId: string;
      plan: "free" | "pro" | "max" | "enterprise";
      subscriptionStatus?: string;
    }
  ) => Promise<null>;
};

/**
 * Resolve a Polar product id to one of our OrgPlan values. Env ids must match
 * the `products` map in `convex/polar.ts` and the NEXT_PUBLIC_ ids in
 * `lib/plans.ts`. Unknown ids return null (event ignored).
 */
function planForPolarProduct(
  productId: string | undefined
): "pro" | "max" | "enterprise" | null {
  if (!productId) {
    return null;
  }
  const map: Record<string, "pro" | "max" | "enterprise"> = {};
  for (const id of [
    process.env.POLAR_PRO_MONTHLY,
    process.env.POLAR_PRO_ANNUAL,
  ]) {
    if (id) map[id] = "pro";
  }
  for (const id of [
    process.env.POLAR_MAX_MONTHLY,
    process.env.POLAR_MAX_ANNUAL,
  ]) {
    if (id) map[id] = "max";
  }
  for (const id of [
    process.env.POLAR_ENTERPRISE_MONTHLY,
    process.env.POLAR_ENTERPRISE_ANNUAL,
  ]) {
    if (id) map[id] = "enterprise";
  }
  return map[productId] ?? null;
}

/**
 * Resolve the org's clerkOrgId from a Polar subscription. The @convex-dev/polar
 * component keys customers by the `userId` returned from `getUserInfo` (our
 * clerkOrgId) and stores it on the Polar customer's `metadata.userId` — it does
 * NOT use Polar's native `externalId`. We read metadata first, and fall back to
 * `externalId` / top-level subscription metadata for robustness across versions.
 */
function clerkOrgIdForSubscription(sub: Subscription): string | undefined {
  const candidates = [
    sub.customer?.metadata?.userId,
    sub.customer?.externalId,
    sub.metadata?.userId,
  ];
  for (const candidate of candidates) {
    if (candidate != null && candidate !== "") {
      return String(candidate);
    }
  }
  return undefined;
}

/**
 * Mirror a Polar subscription onto the org. Active/trialing subscriptions set
 * the paid plan; anything else (canceled, revoked, past_due beyond grace) drops
 * the org back to Free. The Polar customer key is the org's clerkOrgId (set in
 * convex/polar.ts as `getUserInfo().userId`), carried on `customer.metadata.userId`.
 */
async function syncPolarSubscription(
  ctx: RunMutationCtx,
  sub: Subscription
) {
  const clerkOrgId = clerkOrgIdForSubscription(sub);
  if (!clerkOrgId) {
    console.error(
      "Polar subscription event missing customer userId metadata",
      sub.id
    );
    return;
  }

  const status: string = sub.status;
  const isActive = status === "active" || status === "trialing";
  const paidPlan = planForPolarProduct(sub.productId);
  const plan = isActive && paidPlan ? paidPlan : "free";

  await ctx.runMutation(internal.webhooks.setOrgPlanByClerkOrgId, {
    clerkOrgId,
    plan,
    subscriptionStatus: status,
  });
}

// Polar billing. registerRoutes verifies the webhook signature and keeps the
// component's own customer/subscription tables in sync automatically; our
// handlers additionally mirror the active plan onto `organizations.plan`.
// `subscription.updated` also fires on cancellation/revocation (with the new
// status), so syncPolarSubscription downgrades to Free there.
polar.registerRoutes(http, {
  events: {
    "subscription.created": (ctx, event) =>
      syncPolarSubscription(ctx, event.data),
    "subscription.updated": (ctx, event) =>
      syncPolarSubscription(ctx, event.data),
    "subscription.active": (ctx, event) =>
      syncPolarSubscription(ctx, event.data),
  },
});

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      console.error("CLERK_WEBHOOK_SECRET is not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    const payload = await request.text();

    let event: ClerkEvent;
    try {
      const wh = new Webhook(secret);
      event = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkEvent;
    } catch (error) {
      console.error("Clerk webhook verification failed", error);
      return new Response("Verification failed", { status: 400 });
    }

    await ctx.runMutation(internal.webhooks.handleClerkEvent, {
      eventType: event.type,
      data: event.data,
    });

    return new Response(null, { status: 200 });
  }),
});

// Telegram sends bot updates here. The `secret_token` we set via setWebhook is
// echoed in this header; handleUpdate verifies it against a live integration
// before acting. Always 200 so Telegram doesn't retry-storm on our errors.
http.route({
  path: "/telegram-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    let update: unknown;
    try {
      update = await request.json();
    } catch (err) {
      console.warn("Telegram webhook received invalid JSON payload", err);
      return new Response(null, { status: 200 });
    }
    try {
      await ctx.runMutation(internal.telegram.bot.handleUpdate, {
        update,
        secret,
      });
    } catch (error) {
      console.error("Telegram webhook handling failed", error);
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
