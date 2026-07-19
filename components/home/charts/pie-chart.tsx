"use client";

import { cn } from "@/lib/utils";

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieSlice[];
  size?: number;
  className?: string;
}

/**
 * Lightweight SVG donut/pie chart. No external charting library needed.
 * Renders a donut with animated stroke-dasharray segments.
 */
export function PieChart({ data, size = 180, className }: PieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 8;
  const strokeWidth = 32;
  const innerRadius = radius - strokeWidth / 2;
  const circumference = 2 * Math.PI * innerRadius;

  let cumulativeOffset = 0;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="drop-shadow-sm"
      >
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={innerRadius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />

        {/* Data segments */}
        {data.map((slice) => {
          if (slice.value === 0) return null;
          const pct = slice.value / total;
          const dashLength = pct * circumference;
          const dashGap = circumference - dashLength;
          const offset = cumulativeOffset;
          cumulativeOffset += dashLength;

          return (
            <circle
              key={slice.label}
              cx={cx}
              cy={cy}
              r={innerRadius}
              fill="none"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${dashGap}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              className="transition-all duration-700"
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: `${cx}px ${cy}px`,
              }}
            />
          );
        })}

        {/* Center label */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="fill-foreground text-2xl font-bold"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          total
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((slice) => {
          if (slice.value === 0) return null;
          return (
            <div key={slice.label} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-xs text-muted-foreground">
                {slice.label}
              </span>
              <span className="text-xs font-medium">{slice.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
