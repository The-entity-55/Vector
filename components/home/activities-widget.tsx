"use client";

import { useMemo } from "react";
import { Activity, X, ArrowUpRight, CheckCircle2, Circle, Clock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { StatusIcon } from "@/components/shared/status-icon";
import { type IssueStatus } from "@/components/shared/issue-meta";

interface Task {
  _id: string;
  status: IssueStatus;
  priority: string;
  title: string;
  dueDate?: number;
  _creationTime: number;
  teamKey: string;
  number: number;
}

interface ActivitiesWidgetProps {
  tasks: Task[];
  orgSlug: string;
  nowMs: number;
  onRemove: () => void;
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

export function ActivitiesWidget({
  tasks,
  orgSlug,
  nowMs,
  onRemove,
}: ActivitiesWidgetProps) {
  // Show the 10 most recently created/updated tasks as activity items
  const recentActivity = useMemo(() => {
    const sorted = [...tasks].sort(
      (a, b) => b._creationTime - a._creationTime,
    );
    return sorted.slice(0, 10);
  }, [tasks]);

  return (
    <div className="group relative rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="flex size-6 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-500">
          <Activity className="size-3.5" />
        </div>
        <h3 className="text-sm font-medium">Activities</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          Recent
        </span>
        <button
          onClick={onRemove}
          className="ml-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {recentActivity.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Clock className="size-5 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">No recent activity.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {recentActivity.map((task, i) => (
            <Link
              key={task._id}
              href={`/${orgSlug}/issue/${task._id}`}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40",
                i < recentActivity.length - 1 && "border-b border-border/50",
              )}
            >
              {/* Status icon */}
              <StatusIcon status={task.status} className="size-3.5 shrink-0" />

              {/* Issue identifier */}
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {task.teamKey}-{task.number}
              </span>

              {/* Title */}
              <span className="truncate">{task.title}</span>

              {/* Timestamp */}
              <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                {relativeTime(task._creationTime, nowMs)}
              </span>

              <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/50" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
