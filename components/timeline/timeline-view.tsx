"use client";

import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

// Workspace-local UTC offset (mirrors calendar-view.tsx).
const WORKSPACE_OFFSET_MINUTES = 330; // IST UTC+5:30
const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 36; // px per issue row
const LABEL_WIDTH = 220; // px for the left issue-label gutter

// Zoom bounds for the day-column width. The timeline "stretches" between these.
const MIN_DAY_WIDTH = 14; // px per day, fully zoomed out
const MAX_DAY_WIDTH = 140; // px per day, fully zoomed in
const DEFAULT_DAY_WIDTH = 36; // px per day, the resting zoom level
const ZOOM_STEP = 1.25; // multiplier per button click / wheel notch

const STATUS_BAR: Record<string, string> = {
  backlog: "bg-muted-foreground/40",
  todo: "bg-blue-500/70",
  in_progress: "bg-amber-500/80",
  in_review: "bg-purple-500/80",
  done: "bg-emerald-500/80",
  canceled: "bg-muted-foreground/30",
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function clampDayWidth(value: number): number {
  return Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH, value));
}

/** Day index (days since epoch) in workspace-local time. */
function dayIndex(ms: number): number {
  return Math.floor((ms + WORKSPACE_OFFSET_MINUTES * 60 * 1000) / DAY_MS);
}

function fromDayIndex(index: number): Date {
  return new Date(index * DAY_MS - WORKSPACE_OFFSET_MINUTES * 60 * 1000);
}

type Dependency = { from: Id<"issues">; to: Id<"issues"> };

type PlacedIssue = {
  issue: Doc<"issues">;
  startIdx: number;
  endIdx: number;
  row: number;
};

export function TimelineView({
  issues,
  dependencies,
  teamKey,
  orgSlug,
}: {
  issues: Doc<"issues">[];
  dependencies: Dependency[];
  teamKey: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  // Captured once at mount; the day boundary doesn't need live updates here.
  const [nowMs] = useState(() => Date.now());

  // Zoom: width of a single day column in px. Everything on the grid derives
  // from this, so changing it "stretches" the whole timeline.
  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH);
  // Mirror in a ref so the native wheel listener reads the live value.
  const dayWidthRef = useRef(dayWidth);
  useEffect(() => {
    dayWidthRef.current = dayWidth;
  }, [dayWidth]);
  // Pending scroll anchor so a zoom keeps the day under the cursor fixed.
  const zoomAnchor = useRef<{ day: number; offsetX: number } | null>(null);

  // Bar/label text grows with zoom so titles become readable as you stretch.
  const barFontPx = Math.round(Math.min(14, Math.max(10, dayWidth * 0.28)));

  // Only issues with at least a due date land on the timeline. A missing start
  // date renders as a single-day marker on the due date.
  const scheduled = useMemo(
    () => issues.filter((i) => i.dueDate != null),
    [issues]
  );
  const unscheduled = useMemo(
    () => issues.filter((i) => i.dueDate == null),
    [issues]
  );

  // Window: default to the range spanning the scheduled work, clamped to a
  // sensible minimum, then shifted by the user's week navigation.
  const todayIdx = dayIndex(nowMs);
  const { windowStart, windowDays } = useMemo(() => {
    if (scheduled.length === 0) {
      return { windowStart: todayIdx - 3 + weekOffset * 7, windowDays: 28 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const issue of scheduled) {
      const end = dayIndex(issue.dueDate as number);
      const start = issue.startDate != null ? dayIndex(issue.startDate) : end;
      min = Math.min(min, start);
      max = Math.max(max, end);
    }
    const start = Math.min(min, todayIdx) - 2 + weekOffset * 7;
    const span = Math.max(28, max - start + 4);
    return { windowStart: start, windowDays: span };
  }, [scheduled, todayIdx, weekOffset]);

  // Assign each scheduled issue to a row (greedy lane packing to avoid overlap).
  const placed: PlacedIssue[] = useMemo(() => {
    const sorted = [...scheduled].sort((a, b) => {
      const aStart =
        a.startDate != null ? a.startDate : (a.dueDate as number);
      const bStart =
        b.startDate != null ? b.startDate : (b.dueDate as number);
      return aStart - bStart;
    });
    const result: PlacedIssue[] = [];
    sorted.forEach((issue, row) => {
      const endIdx = dayIndex(issue.dueDate as number);
      const startIdx =
        issue.startDate != null ? dayIndex(issue.startDate) : endIdx;
      result.push({ issue, startIdx, endIdx, row });
    });
    return result;
  }, [scheduled]);

  const rowByIssue = useMemo(() => {
    const map = new Map<Id<"issues">, PlacedIssue>();
    for (const p of placed) map.set(p.issue._id, p);
    return map;
  }, [placed]);

  const gridWidth = windowDays * dayWidth;
  const gridHeight = Math.max(placed.length, 1) * ROW_HEIGHT;

  // Day column headers.
  const dayCols = useMemo(() => {
    const cols: { idx: number; date: Date }[] = [];
    for (let i = 0; i < windowDays; i++) {
      const idx = windowStart + i;
      cols.push({ idx, date: fromDayIndex(idx) });
    }
    return cols;
  }, [windowStart, windowDays]);

  const xForDay = (idx: number) => (idx - windowStart) * dayWidth;

  // Dependency arrows between bars that are both placed.
  const arrows = useMemo(() => {
    const dayX = (idx: number) => (idx - windowStart) * dayWidth;
    const paths: { id: string; d: string }[] = [];
    for (const dep of dependencies) {
      const from = rowByIssue.get(dep.from);
      const to = rowByIssue.get(dep.to);
      if (!from || !to) continue;
      const x1 = dayX(from.endIdx) + dayWidth;
      const y1 = from.row * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = dayX(to.startIdx);
      const y2 = to.row * ROW_HEIGHT + ROW_HEIGHT / 2;
      const midX = Math.max(x1 + 12, (x1 + x2) / 2);
      paths.push({
        id: `${dep.from}-${dep.to}`,
        d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
      });
    }
    return paths;
  }, [dependencies, rowByIssue, windowStart, dayWidth]);

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  /** Zoom while keeping the day under `offsetX` (px from the body's left) fixed. */
  const zoomTo = (nextWidth: number, offsetX?: number) => {
    const body = bodyRef.current;
    const clamped = clampDayWidth(nextWidth);
    if (clamped === dayWidthRef.current) return;
    if (body) {
      const anchorX = offsetX ?? body.clientWidth / 2;
      const dayAtAnchor = (body.scrollLeft + anchorX) / dayWidthRef.current;
      zoomAnchor.current = { day: dayAtAnchor, offsetX: anchorX };
    }
    setDayWidth(clamped);
  };

  // Ctrl/⌘ + wheel (and trackpad pinch, which browsers send as ctrl+wheel)
  // stretches the timeline toward the cursor.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = body.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomTo(dayWidthRef.current * factor, offsetX);
    };
    body.addEventListener("wheel", onWheel, { passive: false });
    return () => body.removeEventListener("wheel", onWheel);
  }, []);

  // After a zoom, restore the scroll position so the anchored day stays put.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || !zoomAnchor.current) return;
    const { day, offsetX } = zoomAnchor.current;
    body.scrollLeft = day * dayWidth - offsetX;
    zoomAnchor.current = null;
  }, [dayWidth]);

  // Keep the sticky day-header horizontally in sync with the body scroll.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const header = headerRef.current;
    if (!body || !header) return;
    const onScroll = () => {
      header.scrollLeft = body.scrollLeft;
    };
    body.addEventListener("scroll", onScroll);
    return () => body.removeEventListener("scroll", onScroll);
  }, []);

  const zoomPct = Math.round((dayWidth / DEFAULT_DAY_WIDTH) * 100);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <span className="text-sm font-medium">Timeline</span>
        <div className="ml-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Earlier"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setWeekOffset(0)}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Later"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        {/* Zoom / stretch controls */}
        <div
          className="ml-2 flex items-center gap-1.5 border-l pl-2"
          title="Zoom the timeline — or hold Ctrl/⌘ and scroll"
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => zoomTo(dayWidth / ZOOM_STEP)}
            disabled={dayWidth <= MIN_DAY_WIDTH}
            aria-label="Zoom out"
          >
            <Minus className="size-3.5" />
          </Button>
          <input
            type="range"
            min={MIN_DAY_WIDTH}
            max={MAX_DAY_WIDTH}
            step={1}
            value={dayWidth}
            onChange={(e) => zoomTo(Number(e.target.value))}
            aria-label="Timeline zoom"
            className="h-1.5 w-28 cursor-pointer accent-primary"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => zoomTo(dayWidth * ZOOM_STEP)}
            disabled={dayWidth >= MAX_DAY_WIDTH}
            aria-label="Zoom in"
          >
            <Plus className="size-3.5" />
          </Button>
          <button
            type="button"
            onClick={() => zoomTo(DEFAULT_DAY_WIDTH)}
            className="w-10 text-right text-[11px] tabular-nums text-muted-foreground hover:text-foreground"
            title="Reset zoom"
          >
            {zoomPct}%
          </button>
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {placed.length} scheduled
          {unscheduled.length > 0 ? ` · ${unscheduled.length} unscheduled` : ""}
        </span>
      </div>

      {/* Day header (horizontally scrolled in sync with body) */}
      <div className="flex shrink-0 border-b">
        <div
          className="shrink-0 border-r bg-muted/30"
          style={{ width: LABEL_WIDTH }}
        />
        <div ref={headerRef} className="flex-1 overflow-hidden">
          <div className="flex" style={{ width: gridWidth }}>
            {dayCols.map(({ idx, date }) => {
              const isToday = idx === todayIdx;
              const isFirst = date.getDate() === 1;
              return (
                <div
                  key={idx}
                  className={`flex shrink-0 flex-col items-center justify-center border-r py-1 text-[10px] ${
                    isToday ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground"
                  }`}
                  style={{ width: dayWidth }}
                >
                  {isFirst && (
                    <span className="text-[9px] font-medium">
                      {MONTH_NAMES[date.getMonth()]}
                    </span>
                  )}
                  <span>{date.getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="flex">
          {/* Left label gutter */}
          <div
            className="shrink-0 border-r"
            style={{ width: LABEL_WIDTH }}
          >
            {placed.map((p) => (
              <button
                key={p.issue._id}
                onClick={() =>
                  router.push(`/${orgSlug}/issue/${p.issue._id}`)
                }
                className="flex w-full items-center gap-2 border-b px-3 text-left text-xs hover:bg-muted/50"
                style={{ height: ROW_HEIGHT }}
              >
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {teamKey}-{p.issue.number}
                </span>
                <span className="truncate">{p.issue.title}</span>
              </button>
            ))}
            {placed.length === 0 && (
              <div
                className="flex items-center px-3 text-xs text-muted-foreground"
                style={{ height: ROW_HEIGHT }}
              >
                No scheduled tasks
              </div>
            )}
          </div>

          {/* Bars + arrows */}
          <div ref={bodyRef} className="relative flex-1 overflow-x-auto">
            <div
              className="relative"
              style={{ width: gridWidth, height: gridHeight }}
            >
              {/* Day column grid lines */}
              {dayCols.map(({ idx }) => (
                <div
                  key={idx}
                  className={`absolute top-0 border-r ${
                    idx === todayIdx ? "bg-primary/5" : ""
                  }`}
                  style={{
                    left: xForDay(idx),
                    width: dayWidth,
                    height: gridHeight,
                  }}
                />
              ))}

              {/* Dependency arrows */}
              <svg
                className="pointer-events-none absolute inset-0"
                width={gridWidth}
                height={gridHeight}
              >
                <defs>
                  <marker
                    id="timeline-arrow"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" />
                  </marker>
                </defs>
                {arrows.map((arrow) => (
                  <path
                    key={arrow.id}
                    d={arrow.d}
                    fill="none"
                    className="stroke-muted-foreground/60"
                    strokeWidth={1.5}
                    markerEnd="url(#timeline-arrow)"
                  />
                ))}
              </svg>

              {/* Issue bars */}
              {placed.map((p) => {
                const left = xForDay(p.startIdx);
                const width = Math.max(
                  dayWidth - 6,
                  (p.endIdx - p.startIdx + 1) * dayWidth - 6
                );
                return (
                  <button
                    key={p.issue._id}
                    onClick={() =>
                      router.push(`/${orgSlug}/issue/${p.issue._id}`)
                    }
                    className={`absolute flex items-center rounded px-2 text-white shadow-sm transition-opacity hover:opacity-90 ${
                      STATUS_BAR[p.issue.status] ?? "bg-muted-foreground/50"
                    }`}
                    style={{
                      left: left + 3,
                      top: p.row * ROW_HEIGHT + 6,
                      width,
                      height: ROW_HEIGHT - 12,
                      fontSize: barFontPx,
                    }}
                    title={`${teamKey}-${p.issue.number} · ${p.issue.title}`}
                  >
                    <span className="truncate">{p.issue.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
