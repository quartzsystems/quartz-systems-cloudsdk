"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useId, useMemo, useRef, useState } from "react";

export interface TrendPoint {
  /** Short x-axis label, e.g. "Jul 17". */
  label: string;
  value: number;
}

// Single-series area chart drawn as inline SVG (no chart library — this ships as
// a static export). Title names the one series, so there is no legend. Includes
// a hover crosshair + tooltip. Scales responsively via a viewBox; strokes use
// non-scaling-stroke so they stay crisp at any width.

const W = 340;
const H = 120;
const PAD = { top: 10, right: 8, bottom: 20, left: 8 };

export function TrendChart({
  title,
  data,
  color,
  unit = "",
}: {
  title: string;
  data: TrendPoint[];
  color: string;
  unit?: string;
}) {
  const gradId = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const geom = useMemo(() => {
    const n = data.length;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const max = Math.max(1, ...data.map((d) => d.value));
    const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const pts = data.map((d, i) => ({ x: x(i), y: y(d.value) }));
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    const area =
      pts.length > 0
        ? `${line} L${pts[pts.length - 1].x},${PAD.top + plotH} L${pts[0].x},${PAD.top + plotH} Z`
        : "";
    return { pts, line, area, max, baseline: PAD.top + plotH };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="surface p-4 flex flex-col min-h-[190px]">
        <h3 className="text-[12.5px] font-semibold text-[var(--qz-fg-2)] m-0 mb-2">{title}</h3>
        <div className="flex-1 grid place-items-center">
          <p className="text-[11.5px] text-[var(--qz-fg-4)] m-0 text-center max-w-[200px]">
            No history recorded yet — trends fill in as the console is used.
          </p>
        </div>
      </div>
    );
  }

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const i = Math.round(ratio * (data.length - 1));
    setActive(Math.max(0, Math.min(data.length - 1, i)));
  };

  // Show ~5 evenly spaced x labels so ticks never crowd.
  const labelStep = Math.max(1, Math.ceil(data.length / 5));

  return (
    <div className="surface p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12.5px] font-semibold text-[var(--qz-fg-2)] m-0">{title}</h3>
        {active !== null && (
          <span className="text-[11px] font-mono" style={{ color }}>
            {data[active].value.toLocaleString()}
            {unit}
          </span>
        )}
      </div>

      <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Recessive baseline + max gridline */}
          <line
            x1={PAD.left}
            y1={geom.baseline}
            x2={W - PAD.right}
            y2={geom.baseline}
            stroke="var(--qz-border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          <path d={geom.area} fill={`url(#${gradId})`} />
          <path
            d={geom.line}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Crosshair + active marker */}
          {active !== null && geom.pts[active] && (
            <>
              <line
                x1={geom.pts[active].x}
                y1={PAD.top}
                x2={geom.pts[active].x}
                y2={geom.baseline}
                stroke="var(--qz-border-strong)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={geom.pts[active].x}
                cy={geom.pts[active].y}
                r="3.5"
                fill={color}
                stroke="var(--qz-surface)"
                strokeWidth="2"
              />
            </>
          )}

          {/* End marker */}
          <circle
            cx={geom.pts[geom.pts.length - 1].x}
            cy={geom.pts[geom.pts.length - 1].y}
            r="2.5"
            fill={color}
          />

          {/* x labels */}
          {data.map((d, i) =>
            i % labelStep === 0 || i === data.length - 1 ? (
              <text
                key={i}
                x={geom.pts[i].x}
                y={H - 6}
                textAnchor="middle"
                fontSize="8"
                fill="var(--qz-fg-4)"
                fontFamily="var(--qz-font-mono)"
              >
                {d.label}
              </text>
            ) : null,
          )}
        </svg>

        {/* Tooltip */}
        {active !== null && (
          <div
            className="absolute -translate-x-1/2 -top-1 pointer-events-none px-2 py-1 rounded-md text-[10.5px] font-mono whitespace-nowrap"
            style={{
              left: `${(active / Math.max(1, data.length - 1)) * 100}%`,
              background: "var(--qz-surface-raised)",
              border: "1px solid var(--qz-border)",
              boxShadow: "var(--qz-shadow-2)",
              color: "var(--qz-fg-1)",
            }}
          >
            <span className="text-[var(--qz-fg-4)]">{data[active].label}: </span>
            {data[active].value.toLocaleString()}
            {unit}
          </div>
        )}
      </div>
    </div>
  );
}
