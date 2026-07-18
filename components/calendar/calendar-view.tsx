"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Doc } from "@/convex/_generated/dataModel";
import { STATUSES } from "@/components/shared/issue-meta";
import { StatusIcon } from "@/components/shared/status-icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

// Workspace-local UTC offset in minutes (mirrors the server default).
const WORKSPACE_OFFSET_MINUTES = 330; // IST UTC+5:30

function toLocalDate(ms: number): { year: number; month: number; day: number } {
  const shifted = new Date(ms + WORKSPACE_OFFSET_MINUTES * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_BG: Record<string, string> = {
  backlog: "bg-muted text-muted-foreground",
  todo: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  in_review: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  canceled: "bg-muted/50 text-muted-foreground line-through",
};

export function CalendarView({
  issues,
  teamKey,
  orgSlug,
}: {
  issues: Doc<"issues">[];
  teamKey: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const [now] = useState(() => new Date());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const todayLocal = toLocalDate(now.getTime());

  // Build a map: "YYYY-M-D" -> issues[]
  const byDay = new Map<string, Doc<"issues">[]>();
  for (const issue of issues) {
    if (issue.dueDate == null) continue;
    const { year: y, month: m, day: d } = toLocalDate(issue.dueDate);
    const key = `${y}-${m}-${d}`;
    const list = byDay.get(key) ?? [];
    list.push(issue);
    byDay.set(key, list);
  }

  // Calendar grid: first day of month, then fill to complete weeks.
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Total cells: pad to always show full weeks.
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDow + 1;
    cells.push({ day: dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null });
  }

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  const issuesWithoutDate = issues.filter(i => i.dueDate == null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <span className="min-w-[10rem] text-sm font-medium">
          {MONTH_NAMES[month]} {year}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={nextMonth} aria-label="Next month">
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
        {issuesWithoutDate.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {issuesWithoutDate.length} task{issuesWithoutDate.length !== 1 ? "s" : ""} with no due date
          </span>
        )}
      </div>

      {/* Day-of-week labels */}
      <div className="grid shrink-0 grid-cols-7 border-b">
        {DAY_LABELS.map(label => (
          <div key={label} className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground">
            {label}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(5.5rem, 1fr)" }}>
          {cells.map((cell, i) => {
            if (cell.day === null) {
              return <div key={i} className="border-b border-r bg-muted/20" />;
            }
            const key = `${year}-${month}-${cell.day}`;
            const dayIssues = byDay.get(key) ?? [];
            const isToday =
              cell.day === todayLocal.day &&
              month === todayLocal.month &&
              year === todayLocal.year;
            const isLastRow = i >= totalCells - 7;
            return (
              <div
                key={i}
                className={`flex flex-col gap-0.5 overflow-hidden p-1 border-b border-r ${isLastRow ? "border-b-0" : ""}`}
              >
                <span
                  className={`inline-flex size-5 shrink-0 items-center justify-center self-end rounded-full text-[11px] font-medium ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {cell.day}
                </span>
                {dayIssues
                  .sort((a, b) => b.sortOrder - a.sortOrder)
                  .slice(0, 3)
                  .map(issue => (
                    <button
                      key={issue._id}
                      onClick={() => router.push(`/${orgSlug}/issue/${issue._id}`)}
                      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80 ${STATUS_BG[issue.status] ?? "bg-muted"}`}
                    >
                      <StatusIcon status={issue.status} className="size-2.5 shrink-0" />
                      <span className="truncate">
                        <span className="font-medium">{teamKey}-{issue.number}</span>
                        {" "}{issue.title}
                      </span>
                    </button>
                  ))}
                {dayIssues.length > 3 && (
                  <span className="px-1 text-[10px] text-muted-foreground">
                    +{dayIssues.length - 3} more
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
