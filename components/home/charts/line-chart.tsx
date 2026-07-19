"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface LinePoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LinePoint[];
  color?: string;
  className?: string;
  height?: number;
}

export function LineChart({
  data,
  color = "#10b981", // Emerald-500 default
  className,
  height = 120,
}: LineChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  
  // Padding inside the SVG so the line stroke isn't clipped
  const paddingY = 20; 
  const paddingX = 20;

  // Assume total width is fluid by rendering a viewBox that covers a fixed internal coordinate system
  const internalWidth = 500;
  const internalHeight = height + paddingY * 2;

  const points = useMemo(() => {
    if (data.length <= 1) return "";
    const step = (internalWidth - paddingX * 2) / (data.length - 1);

    return data
      .map((d, i) => {
        const x = paddingX + i * step;
        const y =
          paddingY +
          height -
          (d.value / maxValue) * height;
        return `${x},${y}`;
      })
      .join(" ");
  }, [data, maxValue, height, internalWidth]);

  // Construct a path for a smooth curve (catmull-rom style) or fallback to polyline
  const curvePath = useMemo(() => {
    if (data.length === 0) return "";
    if (data.length === 1) {
      const x = internalWidth / 2;
      const y = paddingY + height - (data[0].value / maxValue) * height;
      return `M ${x},${y} L ${x},${y}`;
    }

    const step = (internalWidth - paddingX * 2) / (data.length - 1);
    const coords = data.map((d, i) => {
      return {
        x: paddingX + i * step,
        y: paddingY + height - (d.value / maxValue) * height,
      };
    });

    // Simple bezier curve approximation
    let path = `M ${coords[0].x},${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const ctrlX = (curr.x + next.x) / 2;
      path += ` C ${ctrlX},${curr.y} ${ctrlX},${next.y} ${next.x},${next.y}`;
    }
    return path;
  }, [data, maxValue, height, internalWidth]);

  const fillPath = useMemo(() => {
    if (!curvePath) return "";
    const step = (internalWidth - paddingX * 2) / (Math.max(data.length - 1, 1));
    const firstX = paddingX;
    const lastX = paddingX + (data.length - 1) * step;
    return `${curvePath} L ${lastX},${internalHeight} L ${firstX},${internalHeight} Z`;
  }, [curvePath, data.length, internalHeight]);

  return (
    <div className={cn("w-full relative", className)} style={{ minHeight: internalHeight }}>
      <svg
        viewBox={`0 0 ${internalWidth} ${internalHeight}`}
        preserveAspectRatio="none"
        className="w-full h-full absolute inset-0 overflow-visible"
      >
        {/* Gradient Definition */}
        <defs>
          <linearGradient id="lineChartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Fill Area under curve */}
        {fillPath && (
          <path
            d={fillPath}
            fill="url(#lineChartGradient)"
            className="transition-all duration-700"
          />
        )}

        {/* Smooth Curve Line */}
        {curvePath && (
          <path
            d={curvePath}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-all duration-700 drop-shadow-sm"
          />
        )}

        {/* Data points (dots) */}
        {data.map((d, i) => {
          const step = (internalWidth - paddingX * 2) / (Math.max(data.length - 1, 1));
          const x = paddingX + i * step;
          const y = paddingY + height - (d.value / maxValue) * height;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill={color}
              stroke="var(--background)"
              strokeWidth="2"
              className="transition-all duration-700"
            />
          );
        })}
      </svg>
      
      {/* Optional: Add custom x-axis labels if needed via HTML overlay */}
      <div className="absolute inset-x-0 bottom-0 flex justify-between px-5 text-[10px] text-muted-foreground translate-y-full pt-1">
        <span>{data[0]?.label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.label}</span>}
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
