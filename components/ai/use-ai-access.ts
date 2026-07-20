"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Cosmetic plan gate for AI surfaces, read from the synced Convex
 * `organizations.plan` (source: Polar webhooks). Convex (`hasAiAccess`) is the
 * authoritative enforcement.
 */
export function useAiAccess(): { isLoaded: boolean; hasAccess: boolean } {
  const org = useQuery(api.organizations.current);
  const isLoaded = org !== undefined;
  return {
    isLoaded,
    hasAccess: isLoaded && org !== null && org.plan !== "free",
  };
}
