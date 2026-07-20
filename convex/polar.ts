import { Polar } from "@convex-dev/polar";
import { v } from "convex/values";
import { api, components } from "./_generated/api";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/auth";

/**
 * Polar billing (replaces Clerk Billing). The @convex-dev/polar component keys
 * every customer by the `userId` returned from `getUserInfo` and persists the
 * customer + subscription rows in our Convex DB automatically.
 *
 * We bill PER ORGANIZATION, not per Clerk user, so `userId` here is the org's
 * `clerkOrgId` and the billing email is the acting member's email. That keeps
 * the whole workspace on one subscription and lets the webhook in
 * `convex/http.ts` map events back to `organizations` via `clerkOrgId`.
 *
 * Product ids come from env (sandbox vs production catalog) and MUST match the
 * NEXT_PUBLIC_POLAR_* ids used by the checkout UI in `lib/plans.ts`.
 */

/**
 * Billing identity for the acting user's active org. Returns the org's
 * `clerkOrgId` as the Polar customer key so the whole workspace shares one
 * subscription. Throws (via getAuthContext) until Clerk→Convex sync lands.
 */
export const getBillingIdentity = query({
  args: {},
  returns: v.object({
    userId: v.string(),
    email: v.string(),
  }),
  handler: async (ctx) => {
    const { user, org } = await getAuthContext(ctx);
    return { userId: org.clerkOrgId, email: user.email };
  },
});

export const polar = new Polar(components.polar, {
  getUserInfo: async (ctx): Promise<{ userId: string; email: string }> => {
    return await ctx.runQuery(api.polar.getBillingIdentity, {});
  },
  products: {
    proMonthly: process.env.POLAR_PRO_MONTHLY ?? "",
    proAnnual: process.env.POLAR_PRO_ANNUAL ?? "",
    maxMonthly: process.env.POLAR_MAX_MONTHLY ?? "",
    maxAnnual: process.env.POLAR_MAX_ANNUAL ?? "",
    enterpriseMonthly: process.env.POLAR_ENTERPRISE_MONTHLY ?? "",
    enterpriseAnnual: process.env.POLAR_ENTERPRISE_ANNUAL ?? "",
  },
  // organizationToken, webhookSecret, server all fall back to
  // POLAR_ORGANIZATION_TOKEN / POLAR_WEBHOOK_SECRET / POLAR_SERVER env vars.
});

export const {
  changeCurrentSubscription,
  cancelCurrentSubscription,
  getConfiguredProducts,
  listAllProducts,
  generateCheckoutLink,
  generateCustomerPortalUrl,
} = polar.api();
