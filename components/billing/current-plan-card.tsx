"use client";

import { useOrganization } from "@clerk/nextjs";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { CustomerPortalLink } from "@convex-dev/polar/react";
import { Doc } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice, planForOrg } from "@/lib/plans";

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" {
  if (status === "active" || status === "trialing") {
    return "default";
  }
  if (status === "past_due" || status === "unpaid" || status === "incomplete") {
    return "destructive";
  }
  return "secondary";
}

/**
 * Current-plan summary for the org billing settings page, with Polar's
 * customer portal behind a custom button for admins.
 */
export function CurrentPlanCard({ org }: { org: Doc<"organizations"> }) {
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const plan = planForOrg(org.plan);
  const isPaid = plan.monthlyPrice > 0;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">Plan</h2>
        <p className="text-xs text-muted-foreground">
          The subscription for the {org.name} workspace.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{plan.name}</span>
              {org.subscriptionStatus && (
                <Badge
                  variant={statusBadgeVariant(org.subscriptionStatus)}
                  className="h-4 rounded-full px-1.5 text-[10px] capitalize"
                >
                  {org.subscriptionStatus.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{plan.tagline}</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tracking-tight">
              {formatPrice(plan.monthlyPrice)}
              <span className="text-xs font-normal text-muted-foreground">
                {" "}
                / month
              </span>
            </div>
            {plan.priceNote && (
              <p className="text-[11px] text-muted-foreground">
                {plan.priceNote}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t pt-3">
          {isPaid ? (
            isAdmin ? (
              <CustomerPortalLink
                polarApi={{
                  generateCustomerPortalUrl:
                    api.polar.generateCustomerPortalUrl,
                }}
                className={cn(buttonVariants({ size: "sm" }))}
              >
                Manage subscription
              </CustomerPortalLink>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only workspace admins can manage the subscription.
              </p>
            )
          ) : (
            <Button size="sm" asChild>
              <Link href="/pricing">
                Compare plans
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
