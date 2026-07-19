"use client";

import { useMemo } from "react";
import { BarChart3, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  _id: string;
  status: string;
  priority: string;
  title: string;
  dueDate?: number;
  _creationTime: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface ReportingWidgetProps {
  tasks: Task[];
  nowMs: number;
  onRemove: () => void;
}

export function ReportingWidget({ tasks, nowMs, onRemove }: ReportingWidgetProps) {
  const stats = useMemo(() => {
    const weekAgo = nowMs - 7 * DAY_MS;
    const monthAgo = nowMs - 30 * DAY_MS;

    let completedThisWeek = 0;
    let completedThisMonth = 0;
    let totalCompleted = 0;
    let overdue = 0;
    let totalOpen = 0;

    for (const task of tasks) {
      if (task.status === "done") {
        totalCompleted++;
        if (task._creationTime >= weekAgo) completedThisWeek++;
        if (task._creationTime >= monthAgo) completedThisMonth++;
      } else {
        totalOpen++;
        if (task.dueDate != null && task.dueDate < nowMs) {
          overdue++;
        }
      }
    }

    const completionRate =
      tasks.length > 0
        ? Math.round((totalCompleted / tasks.length) * 100)
        : 0;

    return {
      completedThisWeek,
      completedThisMonth,
      totalCompleted,
      overdue,
      totalOpen,
      completionRate,
      total: tasks.length,
    };
  }, [tasks, nowMs]);

  const trendIcon =
    stats.completionRate >= 70
      ? TrendingUp
      : stats.completionRate >= 40
        ? Minus
        : TrendingDown;

  const trendColor =
    stats.completionRate >= 70
      ? "text-emerald-500"
      : stats.completionRate >= 40
        ? "text-amber-500"
        : "text-red-400";

  const TrendIcon = trendIcon;

  return (
    <div className="group relative rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="flex size-6 items-center justify-center rounded-md bg-violet-500/10 text-violet-500">
          <BarChart3 className="size-3.5" />
        </div>
        <h3 className="text-sm font-medium">Reporting</h3>
        <button
          onClick={onRemove}
          className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="p-4">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="This week"
            value={stats.completedThisWeek}
            sublabel="completed"
            accent="text-emerald-500"
          />
          <StatCard
            label="This month"
            value={stats.completedThisMonth}
            sublabel="completed"
            accent="text-blue-500"
          />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            sublabel={`of ${stats.totalOpen} open`}
            accent={stats.overdue > 0 ? "text-red-400" : "text-muted-foreground"}
          />
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3">
            <div className="flex items-center gap-1">
              <TrendIcon className={cn("size-3.5", trendColor)} />
              <span className={cn("text-lg font-bold tabular-nums", trendColor)}>
                {stats.completionRate}%
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              completion rate
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {stats.total > 0 && (
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Overall progress
              </span>
              <span className="text-xs text-muted-foreground">
                {stats.totalCompleted}/{stats.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                style={{ width: `${stats.completionRate}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: number;
  sublabel: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border px-3 py-3">
      <span className={cn("text-lg font-bold tabular-nums", accent)}>{value}</span>
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[10px] text-muted-foreground">{sublabel}</span>
    </div>
  );
}
