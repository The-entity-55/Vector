"use client";

import { useOrganization } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { CheckoutLink } from "@convex-dev/polar/react";
import { Doc } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  BillingPeriod,
  ENTERPRISE_PLAN,
  MAX_PLAN,
  PRO_PLAN,
  PlanDefinition,
  formatPrice,
  polarProductId,
  priceForPeriod,
} from "@/lib/plans";
import { cn } from "@/lib/utils";
import { BillingPeriodToggle } from "./billing-period-toggle";

/**
 * Upgrade paths from the current plan, with Polar checkout behind custom
 * buttons. Hidden entirely on Enterprise (nothing left to upgrade to).
 */
export function UpgradeOptions({ org }: { org: Doc<"organizations"> }) {
  const [period, setPeriod] = useState<BillingPeriod>("month");

  const upgrades: PlanDefinition[] =
    org.plan === "free"
      ? [PRO_PLAN, MAX_PLAN, ENTERPRISE_PLAN]
      : org.plan === "pro"
        ? [MAX_PLAN, ENTERPRISE_PLAN]
        : org.plan === "max"
          ? [ENTERPRISE_PLAN]
          : [];

  if (upgrades.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Upgrade</h2>
          <p className="text-xs text-muted-foreground">
            Unlock the AI agent and remove workspace limits.
          </p>
        </div>
        <BillingPeriodToggle period={period} onPeriodChange={setPeriod} />
      </div>

      <div
        className={cn(
          "grid gap-3",
          upgrades.length > 1 && "sm:grid-cols-2"
        )}
      >
        {upgrades.map((plan) => (
          <UpgradeCard key={plan.plan} plan={plan} period={period} />
        ))}
      </div>
    </section>
  );
}

function UpgradeCard({
  plan,
  period,
}: {
  plan: PlanDefinition;
  period: BillingPeriod;
}) {
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const productId = polarProductId(plan, period);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card p-4",
        plan.popular && "border-primary/40"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{plan.name}</span>
        {plan.popular && (
          <Badge className="h-4 rounded-full px-1.5 text-[10px]">
            Popular
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight">
          {formatPrice(priceForPeriod(plan, period))}
        </span>
        <span className="text-xs text-muted-foreground">
          / month{period === "annual" && ", billed annually"}
        </span>
      </div>
      {plan.priceNote && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {plan.priceNote}
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-1.5">
        {plan.highlights.slice(0, 3).map((highlight) => (
          <li
            key={highlight}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Check className="size-3.5 shrink-0 text-primary" />
            {highlight}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex-1" />
      {!isAdmin ? (
        <Button size="sm" variant="outline" className="w-full" disabled>
          Ask an admin to upgrade
        </Button>
      ) : productId ? (
        <CheckoutLink
          polarApi={{ generateCheckoutLink: api.polar.generateCheckoutLink }}
          productIds={[productId]}
          className={cn(
            buttonVariants({
              size: "sm",
              variant: plan.popular ? "default" : "outline",
            }),
            "w-full"
          )}
        >
          Upgrade to {plan.name}
        </CheckoutLink>
      ) : (
        <Button size="sm" variant="outline" className="w-full" disabled>
          Contact sales
        </Button>
      )}
    </div>
  );
}
