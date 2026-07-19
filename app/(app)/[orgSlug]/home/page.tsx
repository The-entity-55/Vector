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
import { cn } from "@/lib/utils";

// Workspace-local UTC offset (mirrors my-tasks / calendar-view / timeline-view).
const WORKSPACE_OFFSET_MINUTES = 330; // IST UTC+5:30
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days-since-epoch in workspace-local time. */
function dayIndex(ms: number): number {
  return Math.floor((ms + WORKSPACE_OFFSET_MINUTES * 60 * 1000) / DAY_MS);
}

/** Time-of-day greeting from the local hour. */
function greetingFor(nowMs: number): string {
  const hour = new Date(nowMs).getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

type Tab = "upcoming" | "overdue" | "completed";

const TAB_ORDER: Tab[] = ["upcoming", "overdue", "completed"];
const TAB_LABELS: Record<Tab, string> = {
  upcoming: "Upcoming",
  overdue: "Overdue",
  completed: "Completed",
};

/**
 * Home — a personal landing screen: a time-of-day greeting for the signed-in
 * user, then their assigned work split into Upcoming, Overdue, and Completed
 * the way Asana's Home does.
 */
export default function HomePage() {
  const params = useParams<{ orgSlug: string }>();
  const user = useQuery(api.users.current);
  const tasks = useQuery(api.myTasks.home);
  // Captured once at mount; the day boundary doesn't need live updates here.
  const [nowMs] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("upcoming");

  const buckets = useMemo(() => {
    const map: Record<Tab, typeof tasks> = {
      upcoming: [],
      overdue: [],
      completed: [],
    };
    if (!tasks) return map;
    const todayIdx = dayIndex(nowMs);
    for (const task of tasks) {
      if (task.status === "done") {
        map.completed!.push(task);
        continue;
      }
      // Open work: overdue if its due date is before today, else upcoming.
      if (task.dueDate != null && dayIndex(task.dueDate) < todayIdx) {
        map.overdue!.push(task);
      } else {
        map.upcoming!.push(task);
      }
    }
    // Upcoming/overdue by soonest due date; completed by most recently updated.
    map.upcoming!.sort(
      (a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)
    );
    map.overdue!.sort(
      (a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)
    );
    map.completed!.sort((a, b) => b._creationTime - a._creationTime);
    return map;
  }, [tasks, nowMs]);

  if (tasks === undefined || user === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "";
  const active = buckets[tab] ?? [];

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto flex max-w-3xl flex-col px-6 py-10">
        <header className="flex flex-col items-center gap-1 pb-8 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {new Date(nowMs).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="text-2xl font-semibold">
            {greetingFor(nowMs)}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        </header>

        <div className="rounded-lg border bg-card">
          <div className="flex items-center gap-1 border-b px-2">
            {TAB_ORDER.map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "relative flex h-10 items-center gap-1.5 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  tab === key &&
                    "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
                )}
              >
                {TAB_LABELS[key]}
                <span className="text-xs text-muted-foreground">
                  {buckets[key]!.length}
                </span>
              </button>
            ))}
          </div>

          {active.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
              <p className="text-sm text-muted-foreground">
                {tab === "completed"
                  ? "No completed tasks yet."
                  : tab === "overdue"
                    ? "Nothing overdue. Nicely done."
                    : "No upcoming tasks. Enjoy the calm."}
              </p>
            </div>
          ) : (
            active.map((task) => (
              <Link
                key={task._id}
                href={`/${params.orgSlug}/issue/${task._id}`}
                className="flex h-9 items-center gap-2 border-b px-4 text-sm last:border-b-0 hover:bg-muted/40"
              >
                <StatusIcon status={task.status} className="size-3.5" />
                <PriorityIcon priority={task.priority} className="size-3.5" />
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {task.teamKey}-{task.number}
                </span>
                <span
                  className={cn(
                    "truncate",
                    tab === "completed" && "text-muted-foreground line-through"
                  )}
                >
                  {task.title}
                </span>
                {task.dueDate != null && (
                  <span
                    className={cn(
                      "ml-auto shrink-0 text-[11px]",
                      tab === "overdue"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {new Date(task.dueDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </Link>
            ))
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
