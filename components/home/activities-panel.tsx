"use client";

import { useMemo } from "react";
import { Clock, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { StatusIcon } from "@/components/shared/status-icon";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { type IssueStatus } from "@/components/shared/issue-meta";
import { type IssuePriority } from "@/components/shared/issue-meta";

interface Task {
  _id: string;
  status: IssueStatus;
  priority: IssuePriority;
  title: string;
  dueDate?: number;
  _creationTime: number;
  teamKey: string;
  number: number;
}

interface ActivitiesPanelProps {
  tasks: Task[];
  orgSlug: string;
  nowMs: number;
}

function relativeTime(ms: number, now: number): string {
  const diff = now - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

import { LineChart } from "./charts/line-chart";

export function ActivitiesPanel({
  tasks,
  orgSlug,
  nowMs,
}: ActivitiesPanelProps) {
  const recentActivity = useMemo(() => {
    const sorted = [...tasks].sort(
      (a, b) => b._creationTime - a._creationTime,
    );
    return sorted.slice(0, 15);
  }, [tasks]);

  const lineChartData = useMemo(() => {
    const days = 14;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = new Date(nowMs);
    now.setHours(0, 0, 0, 0); // Start of today
    const startOfTodayMs = now.getTime();

    const points = Array.from({ length: days }).map((_, i) => {
      const dayMs = startOfTodayMs - (days - 1 - i) * DAY_MS;
      const date = new Date(dayMs);
      return {
        label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value: 0,
        startMs: dayMs,
        endMs: dayMs + DAY_MS,
      };
    });

    for (const task of tasks) {
      const point = points.find(
        (p) => task._creationTime >= p.startMs && task._creationTime < p.endMs,
      );
      if (point) {
        point.value += 1;
      }
    }

    return points.map((p) => ({ label: p.label, value: p.value }));
  }, [tasks, nowMs]);

  return (
    <div className="flex flex-col gap-4">
      {/* Performance Curve Graph */}
      <div className="rounded-lg border bg-card p-5">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-sm font-medium">Activity Trend (Last 14 Days)</h3>
        </div>
        <div className="pb-4">
          <LineChart data={lineChartData} height={180} className="mt-2" color="#3b82f6" />
        </div>
      </div>

      {/* Recent Activity List */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-medium">Recent Activity</h3>
          <span className="text-xs text-muted-foreground">
            {tasks.length} total tasks
          </span>
        </div>

        {recentActivity.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Clock className="size-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No recent activity yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {recentActivity.map((task, i) => (
              <Link
                key={task._id}
                href={`/${orgSlug}/issue/${task._id}`}
                className={cn(
                  "group flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40",
                  i < recentActivity.length - 1 && "border-b border-border/50",
                )}
              >
                <StatusIcon status={task.status} className="size-3.5 shrink-0" />
                <PriorityIcon
                  priority={task.priority}
                  className="size-3.5 shrink-0"
                />
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {task.teamKey}-{task.number}
                </span>
                <span className="truncate">{task.title}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {relativeTime(task._creationTime, nowMs)}
                </span>
                <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
