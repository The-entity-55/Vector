"use client";

import { useCallback, useEffect, useState } from "react";

export type WidgetType = "dashboard" | "reporting" | "activities";

export const WIDGET_META: Record<
  WidgetType,
  { label: string; description: string }
> = {
  dashboard: {
    label: "Dashboard",
    description: "Overview of workspace metrics — issues by status and priority",
  },
  reporting: {
    label: "Reporting",
    description: "Task completion trends and productivity stats",
  },
  activities: {
    label: "Activities",
    description: "Recent activity feed across your workspace",
  },
};

export const ALL_WIDGET_TYPES: WidgetType[] = [
  "dashboard",
  "reporting",
  "activities",
];

function storageKey(orgSlug: string): string {
  return `vector_home_widgets_${orgSlug}`;
}

/**
 * Custom hook to manage which home-screen widgets are enabled.
 * Persisted in localStorage per org.
 */
export function useHomeWidgets(orgSlug: string) {
  const [widgets, setWidgets] = useState<WidgetType[]>([]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(orgSlug));
      if (raw) {
        const parsed = JSON.parse(raw) as WidgetType[];
        if (Array.isArray(parsed)) {
          setWidgets(parsed.filter((w) => ALL_WIDGET_TYPES.includes(w)));
        }
      }
    } catch {
      // Ignore malformed data
    }
  }, [orgSlug]);

  const persist = useCallback(
    (next: WidgetType[]) => {
      setWidgets(next);
      try {
        localStorage.setItem(storageKey(orgSlug), JSON.stringify(next));
      } catch {
        // Storage full or unavailable
      }
    },
    [orgSlug],
  );

  const addWidget = useCallback(
    (type: WidgetType) => {
      setWidgets((prev) => {
        if (prev.includes(type)) return prev;
        const next = [...prev, type];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const removeWidget = useCallback(
    (type: WidgetType) => {
      setWidgets((prev) => {
        const next = prev.filter((w) => w !== type);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const hasWidget = useCallback(
    (type: WidgetType) => widgets.includes(type),
    [widgets],
  );

  return { widgets, addWidget, removeWidget, hasWidget };
}
