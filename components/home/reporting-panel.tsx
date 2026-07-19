"use client";

import { useMemo, useState, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  Calendar,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadReportPptx } from "@/lib/report-pptx";
import { PieChart } from "./charts/pie-chart";
import { BarChart } from "./charts/bar-chart";

interface Task {
  _id: string;
  status: string;
  priority: string;
  title: string;
  dueDate?: number;
  _creationTime: number;
  teamKey: string;
  number: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

type Period = "today" | "week" | "month" | "all";

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

const STATUS_COLORS: Record<string, string> = {
  backlog: "#64748b",
  todo: "#a1a1aa",
  in_progress: "#f59e0b",
  in_review: "#3b82f6",
  done: "#10b981",
  canceled: "#f87171",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  canceled: "Canceled",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#60a5fa",
  none: "#a1a1aa",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

interface ReportingPanelProps {
  tasks: Task[];
  nowMs: number;
}

export function ReportingPanel({ tasks, nowMs }: ReportingPanelProps) {
  const [period, setPeriod] = useState<Period>("all");

  // ── Filter tasks by selected period ────────────────────────────────────
  const filtered = useMemo(() => {
    if (period === "all") return tasks;
    const cutoff =
      period === "today"
        ? nowMs - DAY_MS
        : period === "week"
          ? nowMs - 7 * DAY_MS
          : nowMs - 30 * DAY_MS;
    return tasks.filter((t) => t._creationTime >= cutoff);
  }, [tasks, period, nowMs]);

  // ── Compute stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let totalCompleted = 0;
    let overdue = 0;
    let totalOpen = 0;

    for (const task of filtered) {
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
      byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;

      if (task.status === "done") {
        totalCompleted++;
      } else {
        totalOpen++;
        if (task.dueDate != null && task.dueDate < nowMs) {
          overdue++;
        }
      }
    }

    const total = filtered.length;
    const completionRate =
      total > 0 ? Math.round((totalCompleted / total) * 100) : 0;

    return {
      byStatus,
      byPriority,
      totalCompleted,
      overdue,
      totalOpen,
      completionRate,
      total,
    };
  }, [filtered, nowMs]);

  // ── Chart data ─────────────────────────────────────────────────────────
  const pieData = useMemo(
    () =>
      Object.entries(STATUS_COLORS)
        .map(([key, color]) => ({
          label: STATUS_LABELS[key] ?? key,
          value: stats.byStatus[key] ?? 0,
          color,
        }))
        .filter((d) => d.value > 0),
    [stats.byStatus],
  );

  const barData = useMemo(
    () =>
      Object.entries(PRIORITY_COLORS).map(([key, color]) => ({
        label: PRIORITY_LABELS[key] ?? key,
        value: stats.byPriority[key] ?? 0,
        color,
      })),
    [stats.byPriority],
  );

  // ── Download Report as a PowerPoint (.pptx) presentation ─────────────────
  // Generates a multi-slide deck (title, KPIs, status & priority charts) from
  // the currently selected timeline and its live Convex-backed numbers.
  const [downloading, setDownloading] = useState(false);
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const periodLabel =
        PERIOD_OPTIONS.find((p) => p.key === period)?.label ?? period;
      await downloadReportPptx({
        periodLabel,
        generatedMs: nowMs,
        total: stats.total,
        totalCompleted: stats.totalCompleted,
        totalOpen: stats.totalOpen,
        overdue: stats.overdue,
        completionRate: stats.completionRate,
        statusData: pieData,
        priorityData: barData,
      });
    } finally {
      setDownloading(false);
    }
  }, [period, nowMs, stats, pieData, barData]);

  // ── Trend icon ─────────────────────────────────────────────────────────
  const TrendIcon =
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

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header: period filter + download ─────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
          {PERIOD_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                period === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "today" && <Calendar className="size-3" />}
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {downloading ? "Preparing…" : "Download Report"}
        </button>
      </div>

      {/* ── Stat cards ───────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Total Tasks"
          value={stats.total}
          accent="text-foreground"
        />
        <StatCard
          label="Completed"
          value={stats.totalCompleted}
          accent="text-emerald-500"
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          accent={stats.overdue > 0 ? "text-red-400" : "text-muted-foreground"}
        />
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border bg-card px-3 py-4">
          <div className="flex items-center gap-1.5">
            <TrendIcon className={cn("size-4", trendColor)} />
            <span
              className={cn("text-2xl font-bold tabular-nums", trendColor)}
            >
              {stats.completionRate}%
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Completion rate
          </span>
        </div>
      </div>

      {/* ── Charts row ───────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Pie chart — status distribution */}
        <div className="flex flex-col items-center rounded-lg border bg-card p-5">
          <h3 className="mb-4 self-start text-sm font-medium">
            Status Distribution
          </h3>
          <PieChart data={pieData} size={190} />
        </div>

        {/* Bar chart — priority breakdown */}
        <div className="flex flex-col items-center rounded-lg border bg-card p-5">
          <h3 className="mb-4 self-start text-sm font-medium">
            Priority Breakdown
          </h3>
          <BarChart data={barData} height={140} />
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────── */}
      {stats.total > 0 && (
        <div className="rounded-lg border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Overall Progress</h3>
            <span className="text-sm text-muted-foreground">
              {stats.totalCompleted} of {stats.total} tasks completed
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {stats.totalOpen}
              </p>
              <p className="text-[11px] text-muted-foreground">Open</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-emerald-500">
                {stats.totalCompleted}
              </p>
              <p className="text-[11px] text-muted-foreground">Done</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-red-400">
                {stats.overdue}
              </p>
              <p className="text-[11px] text-muted-foreground">Overdue</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card px-3 py-4">
      <span className={cn("text-2xl font-bold tabular-nums", accent)}>
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
