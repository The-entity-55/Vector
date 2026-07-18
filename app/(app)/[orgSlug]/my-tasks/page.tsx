"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";

// Workspace-local UTC offset (mirrors calendar-view / timeline-view).
const WORKSPACE_OFFSET_MINUTES = 330; // IST UTC+5:30
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days-since-epoch in workspace-local time. */
function dayIndex(ms: number): number {
  return Math.floor((ms + WORKSPACE_OFFSET_MINUTES * 60 * 1000) / DAY_MS);
}

type Bucket = "overdue" | "today" | "upcoming" | "later" | "none";

const BUCKET_ORDER: Bucket[] = ["overdue", "today", "upcoming", "later", "none"];
const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming (next 7 days)",
  later: "Later",
  none: "No due date",
};

/**
 * My Tasks — a cross-team home for the signed-in user's assigned, open work,
 * bucketed by due date the way Asana does.
 */
export default function MyTasksPage() {
  const params = useParams<{ orgSlug: string }>();
  const tasks = useQuery(api.myTasks.list);
  // Captured once at mount; the day boundary doesn't need live updates here.
  const [nowMs] = useState(() => Date.now());

  const buckets = useMemo(() => {
    const map: Record<Bucket, typeof tasks> = {
      overdue: [],
      today: [],
      upcoming: [],
      later: [],
      none: [],
    };
    if (!tasks) return map;
    const todayIdx = dayIndex(nowMs);
    for (const task of tasks) {
      let bucket: Bucket;
      if (task.dueDate == null) {
        bucket = "none";
      } else {
        const idx = dayIndex(task.dueDate);
        if (idx < todayIdx) bucket = "overdue";
        else if (idx === todayIdx) bucket = "today";
        else if (idx <= todayIdx + 7) bucket = "upcoming";
        else bucket = "later";
      }
      map[bucket]!.push(task);
    }
    // Sort each bucket by due date then priority-ish stability.
    for (const key of BUCKET_ORDER) {
      map[key]!.sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity));
    }
    return map;
  }, [tasks, nowMs]);

  if (tasks === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm">
        <span className="font-medium">My Tasks</span>
        <span className="text-muted-foreground">{tasks.length}</span>
      </header>
      <ScrollArea className="flex-1">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-32 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing assigned to you. Enjoy the calm.
            </p>
          </div>
        ) : (
          BUCKET_ORDER.filter((key) => (buckets[key]?.length ?? 0) > 0).map(
            (key) => (
              <section key={key}>
                <div className="flex h-9 items-center gap-2 bg-muted/50 px-4 text-sm">
                  <span className="font-medium">{BUCKET_LABELS[key]}</span>
                  <span className="text-xs text-muted-foreground">
                    {buckets[key]!.length}
                  </span>
                </div>
                {buckets[key]!.map((task) => (
                  <Link
                    key={task._id}
                    href={`/${params.orgSlug}/issue/${task._id}`}
                    className="flex h-9 items-center gap-2 border-b px-4 text-sm hover:bg-muted/40"
                  >
                    <StatusIcon status={task.status} className="size-3.5" />
                    <PriorityIcon priority={task.priority} className="size-3.5" />
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {task.teamKey}-{task.number}
                    </span>
                    <span className="truncate">{task.title}</span>
                    {task.dueDate != null && (
                      <span
                        className={`ml-auto shrink-0 text-[11px] ${
                          key === "overdue"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {new Date(task.dueDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </Link>
                ))}
              </section>
            )
          )
        )}
      </ScrollArea>
    </>
  );
}
