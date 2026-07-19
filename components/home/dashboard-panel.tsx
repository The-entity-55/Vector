"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Task {
  _id: string;
  status: string;
  priority: string;
  title: string;
  dueDate?: number;
  _creationTime: number;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  backlog: { label: "Backlog", color: "text-slate-500", bgColor: "bg-slate-500" },
  todo: { label: "Todo", color: "text-zinc-400", bgColor: "bg-zinc-400" },
  in_progress: {
    label: "In Progress",
    color: "text-amber-500",
    bgColor: "bg-amber-500",
  },
  in_review: {
    label: "In Review",
    color: "text-blue-500",
    bgColor: "bg-blue-500",
  },
  done: {
    label: "Done",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500",
  },
  canceled: {
    label: "Canceled",
    color: "text-red-400",
    bgColor: "bg-red-400",
  },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "bg-red-500" },
  high: { label: "High", color: "bg-orange-500" },
  medium: { label: "Medium", color: "bg-amber-500" },
  low: { label: "Low", color: "bg-blue-400" },
  none: { label: "No priority", color: "bg-zinc-400" },
};

interface DashboardPanelProps {
  tasks: Task[];
}

export function DashboardPanel({ tasks }: DashboardPanelProps) {
  const metrics = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
      byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;
    }
    return { byStatus, byPriority, total: tasks.length };
  }, [tasks]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Status breakdown card */}
      <div className="rounded-lg border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Issues by Status</h3>
          <span className="text-xs text-muted-foreground">
            {metrics.total} total
          </span>
        </div>

        {metrics.total > 0 ? (
          <>
            {/* Stacked bar */}
            <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-muted">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = metrics.byStatus[key] ?? 0;
                if (count === 0) return null;
                const pct = (count / metrics.total) * 100;
                return (
                  <div
                    key={key}
                    className={cn(
                      "h-full transition-all duration-500",
                      cfg.bgColor,
                    )}
                    style={{ width: `${pct}%` }}
                    title={`${cfg.label}: ${count}`}
                  />
                );
              })}
            </div>

            {/* Status list */}
            <div className="flex flex-col gap-2">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = metrics.byStatus[key] ?? 0;
                if (count === 0) return null;
                const pct = Math.round((count / metrics.total) * 100);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-block size-2.5 rounded-full",
                        cfg.bgColor,
                      )}
                    />
                    <span className="text-sm">{cfg.label}</span>
                    <span className="ml-auto text-sm font-medium tabular-nums">
                      {count}
                    </span>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No tasks yet.
          </p>
        )}
      </div>

      {/* Priority distribution card */}
      <div className="rounded-lg border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Priority Distribution</h3>
        </div>

        {metrics.total > 0 ? (
          <div className="flex flex-col gap-3">
            {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => {
              const count = metrics.byPriority[key] ?? 0;
              const pct =
                metrics.total > 0
                  ? Math.round((count / metrics.total) * 100)
                  : 0;
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-block size-2.5 rounded-full",
                          cfg.color,
                        )}
                      />
                      <span className="text-sm">{cfg.label}</span>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {count}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        cfg.color,
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No tasks yet.
          </p>
        )}
      </div>
    </div>
  );
}
