/**
 * Single source of truth for billing plan data (Track E).
 *
 * Plan ids/slugs live here and ONLY here — never inline them in components.
 * `convex/lib/limits.ts` is the authoritative enforcement of free-tier caps;
 * the numbers here mirror it for display purposes.
 *
 * Billing runs on Polar (via the @convex-dev/polar Convex component). Each paid
 * plan maps to a pair of Polar product ids (monthly + annual); the `keys` here
 * match the `products` map registered in `convex/polar.ts`.
 */

/** Convex `organizations.plan` values (synced from Polar via webhooks). */
export type OrgPlan = "free" | "pro" | "max" | "enterprise";

export type BillingPeriod = "month" | "annual";

/**
 * Polar product ids for a plan's two billing periods. Read from env so the
 * same code runs against sandbox and production catalogs.
 *
 * These are also the keys of the `products` map in `convex/polar.ts`; the
 * checkout UI passes the resolved id straight to Polar's <CheckoutLink>.
 */
export type PolarProductIds = {
  month: string;
  annual: string;
};

/** Display mirror of `FREE_PLAN_LIMITS` in convex/lib/limits.ts. */
export const FREE_PLAN_DISPLAY_LIMITS = {
  seats: 3,
  projects: 2,
  issues: 100,
} as const;

export type PlanDefinition = {
  /** Convex `organizations.plan` value this plan maps to. Also used as a React key. */
  plan: OrgPlan;
  /**
   * Polar product ids for checkout, or null for plans with no Polar product
   * (Free, and Enterprise if you route it through "contact sales").
   */
  polarProductIds: PolarProductIds | null;
  name: string;
  tagline: string;
  /** USD per month when billed monthly. */
  monthlyPrice: number;
  /** USD per month equivalent when billed annually. */
  annualMonthlyPrice: number;
  /** Extra pricing detail shown under the price (e.g. seat pricing). */
  priceNote?: string;
  /** Seat cap, or null for unlimited. */
  maxSeats: number | null;
  /** Marketing bullet list for the plan card. */
  highlights: string[];
  /** Lead-in line above the highlights, e.g. "Everything in Free, plus:". */
  highlightsLeadIn?: string;
  /** Whether to visually emphasize this plan on the pricing page. */
  popular?: boolean;
};

/**
 * Polar product ids are public (they only identify a checkout target, not a
 * secret) so they ride on NEXT_PUBLIC_ env vars and stay identical between the
 * client checkout links and the server-side product→plan mapping in
 * `convex/polar.ts`. Swap the env values to point at the sandbox vs. production
 * Polar catalog.
 */
const POLAR_PRODUCTS: Record<
  Exclude<OrgPlan, "free">,
  PolarProductIds
> = {
  pro: {
    month: process.env.NEXT_PUBLIC_POLAR_PRO_MONTHLY ?? "",
    annual: process.env.NEXT_PUBLIC_POLAR_PRO_ANNUAL ?? "",
  },
  max: {
    month: process.env.NEXT_PUBLIC_POLAR_MAX_MONTHLY ?? "",
    annual: process.env.NEXT_PUBLIC_POLAR_MAX_ANNUAL ?? "",
  },
  enterprise: {
    month: process.env.NEXT_PUBLIC_POLAR_ENTERPRISE_MONTHLY ?? "",
    annual: process.env.NEXT_PUBLIC_POLAR_ENTERPRISE_ANNUAL ?? "",
  },
};

export const FREE_PLAN: PlanDefinition = {
  plan: "free",
  polarProductIds: null,
  name: "Free",
  tagline: "For small teams getting started with issue tracking.",
  monthlyPrice: 0,
  annualMonthlyPrice: 0,
  maxSeats: FREE_PLAN_DISPLAY_LIMITS.seats,
  highlights: [
    `Up to ${FREE_PLAN_DISPLAY_LIMITS.seats} members`,
    `${FREE_PLAN_DISPLAY_LIMITS.projects} projects`,
    `${FREE_PLAN_DISPLAY_LIMITS.issues} issues`,
    "Unlimited teams and cycles",
    "Kanban boards and saved views",
    "Realtime collaboration",
  ],
};

export const PRO_PLAN: PlanDefinition = {
  plan: "pro",
  polarProductIds: POLAR_PRODUCTS.pro,
  name: "Pro",
  tagline: "For growing teams that want AI superpowers and no limits.",
  monthlyPrice: 20,
  annualMonthlyPrice: 16,
  priceNote: "Per member · up to 10 members",
  maxSeats: 10,
  highlightsLeadIn: "Everything in Free, plus:",
  highlights: [
    "Up to 10 members (seat-based)",
    "Unlimited projects and issues",
    "AI agent with workspace context",
    "50 AI messages per user per day",
    "Triage assist and duplicate detection",
  ],
  popular: true,
};

export const MAX_PLAN: PlanDefinition = {
  plan: "max",
  polarProductIds: POLAR_PRODUCTS.max,
  name: "Max",
  tagline: "For AI-heavy teams that never want to hit a limit.",
  monthlyPrice: 40,
  annualMonthlyPrice: 32,
  priceNote: "Per member · up to 25 members",
  maxSeats: 25,
  highlightsLeadIn: "Everything in Pro, plus:",
  highlights: [
    "Unlimited AI messages (no daily cap)",
    "Priority AI models",
    "Up to 25 members (seat-based)",
    "Standup and cycle reports",
    "Priority email support",
  ],
};

export const ENTERPRISE_PLAN: PlanDefinition = {
  plan: "enterprise",
  polarProductIds: POLAR_PRODUCTS.enterprise,
  name: "Enterprise",
  tagline: "For organizations that need unlimited scale and support.",
  monthlyPrice: 99,
  annualMonthlyPrice: 79,
  priceNote: "Flat rate · unlimited members",
  maxSeats: null,
  highlightsLeadIn: "Everything in Max, plus:",
  highlights: [
    "Unlimited members",
    "Unlimited AI usage",
    "Dedicated priority support",
    "Flat predictable pricing",
  ],
};

export const PLANS: PlanDefinition[] = [
  FREE_PLAN,
  PRO_PLAN,
  MAX_PLAN,
  ENTERPRISE_PLAN,
];

const PLANS_BY_ORG_PLAN: Record<OrgPlan, PlanDefinition> = {
  free: FREE_PLAN,
  pro: PRO_PLAN,
  max: MAX_PLAN,
  enterprise: ENTERPRISE_PLAN,
};

/** Resolve the plan definition for a Convex `organizations.plan` value. */
export function planForOrg(plan: OrgPlan): PlanDefinition {
  return PLANS_BY_ORG_PLAN[plan];
}

/** Resolve the Polar product id for a plan + billing period, if it has one. */
export function polarProductId(
  plan: PlanDefinition,
  period: BillingPeriod
): string | null {
  return plan.polarProductIds ? plan.polarProductIds[period] : null;
}

export function priceForPeriod(
  plan: PlanDefinition,
  period: BillingPeriod
): number {
  return period === "annual" ? plan.annualMonthlyPrice : plan.monthlyPrice;
}

export function formatPrice(amount: number): string {
  return `$${amount}`;
}

// ── Feature comparison table (pricing page) ────────────────────────────────

export type ComparisonValue = string | boolean;

export type ComparisonRow = {
  label: string;
  /** Values in PLANS order: [Free, Pro, Max, Enterprise]. */
  values: [
    ComparisonValue,
    ComparisonValue,
    ComparisonValue,
    ComparisonValue,
  ];
};

export type ComparisonSection = {
  title: string;
  rows: ComparisonRow[];
};

export const COMPARISON_SECTIONS: ComparisonSection[] = [
  {
    title: "Usage",
    rows: [
      {
        label: "Members",
        values: [
          `Up to ${FREE_PLAN_DISPLAY_LIMITS.seats}`,
          "Up to 10",
          "Up to 25",
          "Unlimited",
        ],
      },
      {
        label: "Projects",
        values: [
          `${FREE_PLAN_DISPLAY_LIMITS.projects}`,
          "Unlimited",
          "Unlimited",
          "Unlimited",
        ],
      },
      {
        label: "Issues",
        values: [
          `${FREE_PLAN_DISPLAY_LIMITS.issues}`,
          "Unlimited",
          "Unlimited",
          "Unlimited",
        ],
      },
      {
        label: "Teams and cycles",
        values: ["Unlimited", "Unlimited", "Unlimited", "Unlimited"],
      },
    ],
  },
  {
    title: "Features",
    rows: [
      {
        label: "Kanban boards and list views",
        values: [true, true, true, true],
      },
      {
        label: "Saved views and full-text search",
        values: [true, true, true, true],
      },
      {
        label: "Comments, mentions and activity",
        values: [true, true, true, true],
      },
      { label: "Realtime presence", values: [true, true, true, true] },
    ],
  },
  {
    title: "AI",
    rows: [
      { label: "AI agent", values: [false, true, true, true] },
      {
        label: "AI messages",
        values: [false, "50 / user / day", "Unlimited", "Unlimited"],
      },
      { label: "Priority AI models", values: [false, false, true, true] },
      { label: "Triage assist", values: [false, true, true, true] },
      { label: "Duplicate detection", values: [false, true, true, true] },
      {
        label: "Standup and cycle reports",
        values: [false, false, true, true],
      },
    ],
  },
  {
    title: "Support",
    rows: [
      { label: "Community support", values: [true, true, true, true] },
      {
        label: "Priority support",
        values: [false, false, "Email", "Dedicated"],
      },
    ],
  },
];
