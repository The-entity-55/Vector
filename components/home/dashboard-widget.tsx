"use client";

import { useMemo } from "react";
import { LayoutDashboard, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  _id: string;
  status: string;
  priority: string;
  title: string;
  dueDate?: number;
  _creationTime: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  backlog: { label: "Backlog", color: "text-slate-500", bgColor: "bg-slate-500" },
  todo: { label: "Todo", color: "text-zinc-400", bgColor: "bg-zinc-400" },
  in_progress: { label: "In Progress", color: "text-amber-500", bgColor: "bg-amber-500" },
  in_review: { label: "In Review", color: "text-blue-500", bgColor: "bg-blue-500" },
  done: { label: "Done", color: "text-emerald-500", bgColor: "bg-emerald-500" },
  canceled: { label: "Canceled", color: "text-red-400", bgColor: "bg-red-400" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "bg-red-500" },
  high: { label: "High", color: "bg-orange-500" },
  medium: { label: "Medium", color: "bg-amber-500" },
  low: { label: "Low", color: "bg-blue-400" },
  none: { label: "No priority", color: "bg-zinc-400" },
};

interface DashboardWidgetProps {
  tasks: Task[];
  onRemove: () => void;
}

export function DashboardWidget({ tasks, onRemove }: DashboardWidgetProps) {
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
    <div className="group relative rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <LayoutDashboard className="size-3.5" />
        </div>
        <h3 className="text-sm font-medium">Dashboard</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {metrics.total} total
        </span>
        <button
          onClick={onRemove}
          className="ml-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {/* Status breakdown */}
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            By Status
          </p>
          {metrics.total > 0 ? (
            <>
              {/* Stacked bar */}
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const count = metrics.byStatus[key] ?? 0;
                  if (count === 0) return null;
                  const pct = (count / metrics.total) * 100;
                  return (
                    <div
                      key={key}
                      className={cn("h-full transition-all", cfg.bgColor)}
                      style={{ width: `${pct}%` }}
                      title={`${cfg.label}: ${count}`}
                    />
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const count = metrics.byStatus[key] ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className={cn("inline-block size-2 rounded-full", cfg.bgColor)} />
                      <span className="text-xs text-muted-foreground">
                        {cfg.label}
                      </span>
                      <span className="text-xs font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No tasks yet.</p>
          )}
        </div>

        {/* Priority distribution */}
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            By Priority
          </p>
          {metrics.total > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => {
                const count = metrics.byPriority[key] ?? 0;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <span className={cn("inline-block size-2 rounded-full", cfg.color)} />
                    <span className="text-xs text-muted-foreground">
                      {cfg.label}
                    </span>
                    <span className="ml-auto text-sm font-semibold">{count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No tasks yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
