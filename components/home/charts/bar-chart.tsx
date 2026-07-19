"use client";

import { cn } from "@/lib/utils";

interface BarData {
  label: string;
  value: number;
  color: string;
}

interface BarChartProps {
  data: BarData[];
  className?: string;
  /** Height of the chart area in px (excluding labels). */
  height?: number;
}

/**
 * Lightweight SVG vertical bar chart. Renders bars with rounded tops,
 * value labels above each bar, and category labels below.
 */
export function BarChart({
  data,
  className,
  height = 160,
}: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  const barWidth = 36;
  const gap = 16;
  const labelHeight = 28;
  const topPadding = 24;
  const totalWidth = data.length * barWidth + (data.length - 1) * gap;
  const totalHeight = height + labelHeight + topPadding;

  return (
    <div className={cn("flex justify-center", className)}>
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="overflow-visible"
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((pct) => {
          const y = topPadding + height - pct * height;
          return (
            <line
              key={pct}
              x1={0}
              y1={y}
              x2={totalWidth}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.06}
              strokeDasharray="4 4"
            />
          );
        })}

        {data.map((bar, i) => {
          const barHeight = (bar.value / maxValue) * height;
          const x = i * (barWidth + gap);
          const y = topPadding + height - barHeight;

          return (
            <g key={bar.label}>
              {/* Bar background */}
              <rect
                x={x}
                y={topPadding}
                width={barWidth}
                height={height}
                rx={6}
                fill="currentColor"
                className="text-muted/20"
              />

              {/* Bar fill */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={6}
                fill={bar.color}
                className="transition-all duration-700"
              >
                <animate
                  attributeName="height"
                  from="0"
                  to={barHeight}
                  dur="0.6s"
                  fill="freeze"
                />
                <animate
                  attributeName="y"
                  from={topPadding + height}
                  to={y}
                  dur="0.6s"
                  fill="freeze"
                />
              </rect>

              {/* Value label */}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-foreground text-xs font-semibold"
              >
                {bar.value}
              </text>

              {/* Category label */}
              <text
                x={x + barWidth / 2}
                y={topPadding + height + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
