import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { planValidator } from "./schema";

/**
 * Clerk → Convex sync. Clerk is the source of truth for users, orgs, and
 * memberships; these handlers mirror them into Convex tables so queries can
 * join against them with indexes.
 *
 * Billing is NOT handled here — subscriptions live in Polar and are synced by
 * the @convex-dev/polar component (see `convex/polar.ts` and the Polar route in
 * `convex/http.ts`), which calls `setOrgPlanByClerkOrgId` below.
 */

type ClerkUserData = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: { id: string; email_address: string }[];
};

type ClerkOrgData = {
  id: string;
  name?: string;
  slug?: string | null;
  image_url?: string | null;
};

type ClerkMembershipData = {
  id: string;
  role?: string;
  organization?: { id: string };
  public_user_data?: { user_id: string };
};

export const handleClerkEvent = internalMutation({
  args: {
    eventType: v.string(),
    data: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { eventType } = args;

    if (eventType === "user.created" || eventType === "user.updated") {
      await upsertUser(ctx, args.data as ClerkUserData);
    } else if (eventType === "user.deleted") {
      await deleteUser(ctx, args.data as ClerkUserData);
    } else if (
      eventType === "organization.created" ||
      eventType === "organization.updated"
    ) {
      await upsertOrganization(ctx, args.data as ClerkOrgData);
    } else if (eventType === "organization.deleted") {
      await deleteOrganization(ctx, args.data as ClerkOrgData);
    } else if (
      eventType === "organizationMembership.created" ||
      eventType === "organizationMembership.updated"
    ) {
      await upsertMembership(ctx, args.data as ClerkMembershipData);
    } else if (eventType === "organizationMembership.deleted") {
      await deleteMembership(ctx, args.data as ClerkMembershipData);
    } else {
      console.log("Unhandled Clerk webhook event", eventType);
    }
    return null;
  },
});

async function upsertUser(ctx: MutationCtx, data: ClerkUserData) {
  const primaryEmail =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id)
      ?.email_address ??
    data.email_addresses?.[0]?.email_address ??
    "";
  const name =
    [data.first_name, data.last_name].filter(Boolean).join(" ") ||
    primaryEmail ||
    "Unknown";

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.id))
    .unique();

  const fields = {
    name,
    email: primaryEmail,
    imageUrl: data.image_url ?? undefined,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
  } else {
    await ctx.db.insert("users", { clerkId: data.id, ...fields });
  }
}

async function deleteUser(ctx: MutationCtx, data: ClerkUserData) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.id))
    .unique();
  if (!user) {
    return;
  }
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  for (const membership of memberships) {
    await ctx.db.delete(membership._id);
  }
  await ctx.db.delete(user._id);
}

async function upsertOrganization(ctx: MutationCtx, data: ClerkOrgData) {
  const existing = await ctx.db
    .query("organizations")
    .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", data.id))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: data.name ?? existing.name,
      slug: data.slug ?? existing.slug,
      imageUrl: data.image_url ?? existing.imageUrl,
    });
  } else {
    await ctx.db.insert("organizations", {
      clerkOrgId: data.id,
      name: data.name ?? "Untitled",
      slug: data.slug ?? undefined,
      imageUrl: data.image_url ?? undefined,
      plan: "free",
    });
  }
}

async function deleteOrganization(ctx: MutationCtx, data: ClerkOrgData) {
  const org = await ctx.db
    .query("organizations")
    .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", data.id))
    .unique();
  if (!org) {
    return;
  }
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_org", (q) => q.eq("orgId", org._id))
    .collect();
  for (const membership of memberships) {
    await ctx.db.delete(membership._id);
  }
  // Workspace data (teams/issues/...) is intentionally left for a future
  // cleanup job — orgs are rarely deleted and cascading here would make
  // webhook handling slow.
  await ctx.db.delete(org._id);
}

async function upsertMembership(ctx: MutationCtx, data: ClerkMembershipData) {
  const clerkOrgId = data.organization?.id;
  const clerkUserId = data.public_user_data?.user_id;
  if (!clerkOrgId || !clerkUserId) {
    console.error("Membership event missing org or user id", data.id);
    return;
  }

  const org = await ctx.db
    .query("organizations")
    .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", clerkOrgId))
    .unique();
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
    .unique();
  if (!org || !user) {
    // Clerk fires organization.created and organizationMembership.created
    // near-simultaneously and Svix does not guarantee ordering. Throwing makes
    // the webhook return non-2xx so Svix retries; returning success here would
    // ACK the event and lose the membership forever.
    throw new Error(
      `Membership sync: org or user not synced yet (${clerkOrgId}, ${clerkUserId}) — failing so Svix retries`
    );
  }

  const role = data.role === "org:admin" ? ("admin" as const) : ("member" as const);

  const existing = await ctx.db
    .query("members")
    .withIndex("by_clerk_membership_id", (q) =>
      q.eq("clerkMembershipId", data.id)
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { role });
  } else {
    await ctx.db.insert("members", {
      orgId: org._id,
      userId: user._id,
      role,
      clerkMembershipId: data.id,
    });
  }
}

async function deleteMembership(ctx: MutationCtx, data: ClerkMembershipData) {
  const existing = await ctx.db
    .query("members")
    .withIndex("by_clerk_membership_id", (q) =>
      q.eq("clerkMembershipId", data.id)
    )
    .unique();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

async function getOrgByClerkId(ctx: MutationCtx, clerkOrgId: string) {
  return await ctx.db
    .query("organizations")
    .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", clerkOrgId))
    .unique();
}

/**
 * Fallback: resolve an org via the customer's email when the primary
 * `clerkOrgId` is stale (e.g. the org was deleted and the user moved to a new
 * one). Looks up email → user → first membership → org.
 */
async function resolveOrgByEmail(ctx: MutationCtx, email: string) {
  // No email index — filter scan. Acceptable: this path is rare (only when the
  // primary clerkOrgId fails), and the users table is small per-deployment.
  const allUsers = await ctx.db.query("users").collect();
  const user = allUsers.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (!user) return null;

  const membership = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  if (!membership) return null;

  return await ctx.db.get(membership.orgId);
}

/**
 * Set an org's plan from a Polar subscription event. Called by the Polar
 * webhook handler in `convex/http.ts` after it resolves the Polar product id
 * to one of our `OrgPlan` values. `clerkOrgId` is the Polar customer key we set
 * in `convex/polar.ts` (`getUserInfo` returns `org.clerkOrgId` as `userId`).
 *
 * Resilient fallback: if the org isn't found by `clerkOrgId` (e.g. the org was
 * deleted in Clerk and the user moved to a new one), we attempt to resolve it
 * via the customer's email → user → current membership → org. If that also
 * fails, we log a warning and return (ACK the event) instead of throwing, so
 * Polar doesn't retry forever on a permanently unresolvable org.
 */
export const setOrgPlanByClerkOrgId = internalMutation({
  args: {
    clerkOrgId: v.string(),
    plan: planValidator,
    subscriptionStatus: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let org = await getOrgByClerkId(ctx, args.clerkOrgId);

    if (!org && args.customerEmail) {
      // Primary org ID is stale — try resolving via the customer's email.
      console.warn(
        `Polar plan sync: org ${args.clerkOrgId} not found, attempting email fallback (${args.customerEmail})`
      );
      org = await resolveOrgByEmail(ctx, args.customerEmail);
    }

    if (!org) {
      // Neither path resolved. If we have an email, the org is genuinely gone
      // (deleted in Clerk, user has no current org) — ACK so Polar stops
      // retrying. Without an email we can't distinguish a brief sync delay
      // from a permanent miss, so throw to retry (backward-compatible).
      if (args.customerEmail) {
        console.error(
          `Polar plan sync: org ${args.clerkOrgId} permanently unresolvable ` +
            `(email fallback for ${args.customerEmail} also failed). ` +
            `ACKing event to stop retries.`
        );
        return null;
      }
      throw new Error(
        `Polar plan sync: org not synced yet (${args.clerkOrgId}) — failing so Polar retries`
      );
    }

    await ctx.db.patch(org._id, {
      plan: args.plan,
      subscriptionStatus: args.subscriptionStatus,
    });
    return null;
  },
});
