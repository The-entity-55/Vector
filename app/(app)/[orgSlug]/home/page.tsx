"use client";

import { useQuery } from "convex/react";
import {
  Loader2,
  ListTodo,
  LayoutDashboard,
  BarChart3,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";
import { cn } from "@/lib/utils";
import { DashboardPanel } from "@/components/home/dashboard-panel";
import { ReportingPanel } from "@/components/home/reporting-panel";
import { ActivitiesPanel } from "@/components/home/activities-panel";

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

// ── Sub-tabs for the "My Tasks" view ────────────────────────────────────
type TaskTab = "upcoming" | "overdue" | "completed";

const TASK_TAB_ORDER: TaskTab[] = ["upcoming", "overdue", "completed"];
const TASK_TAB_LABELS: Record<TaskTab, string> = {
  upcoming: "Upcoming",
  overdue: "Overdue",
  completed: "Completed",
};

// ── Top-level home views ────────────────────────────────────────────────
type HomeView = "tasks" | "dashboard" | "reporting" | "activities";

const HOME_VIEWS: {
  key: HomeView;
  label: string;
  icon: typeof ListTodo;
}[] = [
  { key: "tasks", label: "My Tasks", icon: ListTodo },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "reporting", label: "Reporting", icon: BarChart3 },
  { key: "activities", label: "Activities", icon: Activity },
];

/**
 * Home — a personal landing screen with multiple views:
 * My Tasks (Upcoming/Overdue/Completed), Dashboard, Reporting, and Activities.
 */
export default function HomePage() {
  const params = useParams<{ orgSlug: string }>();
  const user = useQuery(api.users.current);
  const tasks = useQuery(api.myTasks.home);
  const [nowMs] = useState(() => Date.now());
  const [view, setView] = useState<HomeView>("tasks");
  const [taskTab, setTaskTab] = useState<TaskTab>("upcoming");

  const buckets = useMemo(() => {
    const map: Record<TaskTab, typeof tasks> = {
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
      if (task.dueDate != null && dayIndex(task.dueDate) < todayIdx) {
        map.overdue!.push(task);
      } else {
        map.upcoming!.push(task);
      }
    }
    map.upcoming!.sort(
      (a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity),
    );
    map.overdue!.sort(
      (a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity),
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
  const active = buckets[taskTab] ?? [];

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto flex max-w-5xl flex-col px-6 py-10">
        {/* ── Greeting header ─────────────────────────────── */}
        <header className="flex flex-col items-center gap-1 pb-6 text-center print:hidden">
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

        {/* ── Top-level view tabs ─────────────────────────── */}
        <div className="mb-6 flex items-center justify-center print:hidden">
          <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
            {HOME_VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  view === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── View content ────────────────────────────────── */}
        {view === "tasks" && (
          <div className="rounded-lg border bg-card">
            <div className="flex items-center gap-1 border-b px-2">
              {TASK_TAB_ORDER.map((key) => (
                <button
                  key={key}
                  onClick={() => setTaskTab(key)}
                  className={cn(
                    "relative flex h-10 items-center gap-1.5 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                    taskTab === key &&
                      "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                  )}
                >
                  {TASK_TAB_LABELS[key]}
                  <span className="text-xs text-muted-foreground">
                    {buckets[key]!.length}
                  </span>
                </button>
              ))}
            </div>

            {active.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-20 text-center">
                <p className="text-sm text-muted-foreground">
                  {taskTab === "completed"
                    ? "No completed tasks yet."
                    : taskTab === "overdue"
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
                      taskTab === "completed" &&
                        "text-muted-foreground line-through",
                    )}
                  >
                    {task.title}
                  </span>
                  {task.dueDate != null && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 text-[11px]",
                        taskTab === "overdue"
                          ? "text-destructive"
                          : "text-muted-foreground",
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
        )}

        {view === "dashboard" && (
          <DashboardPanel tasks={tasks ?? []} />
        )}

        {view === "reporting" && (
          <ReportingPanel tasks={tasks ?? []} nowMs={nowMs} />
        )}

        {view === "activities" && (
          <ActivitiesPanel
            tasks={tasks ?? []}
            orgSlug={params.orgSlug ?? ""}
            nowMs={nowMs}
          />
        )}
      </div>
    </ScrollArea>
  );
}
