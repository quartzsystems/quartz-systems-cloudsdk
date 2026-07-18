"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { LucideIcon } from "lucide-react";

type Tone = "accent" | "danger" | "warn" | "info" | "neutral";

const toneColor: Record<Tone, string> = {
  accent: "var(--qz-accent)",
  danger: "var(--qz-danger)",
  warn: "var(--qz-warn)",
  info: "var(--qz-info)",
  neutral: "var(--qz-fg-1)",
};

/// A single headline number for the dashboard KPI row. Shows `value` large, with
/// an optional `/ total` denominator and a small sub-label (e.g. a percentage).
export function StatTile({
  icon: Icon,
  label,
  value,
  total,
  sub,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  total?: number;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="kpi-card flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-lg grid place-items-center flex-shrink-0"
        style={{
          background: `color-mix(in oklab, ${toneColor[tone]} 14%, transparent)`,
          color: toneColor[tone],
        }}
      >
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="kpi-label">{label}</span>
        </div>
        <div className="flex items-baseline gap-1 mt-[6px]">
          <span
            className="font-mono font-semibold text-[28px] leading-none"
            style={{ color: toneColor[tone] }}
          >
            {value}
          </span>
          {total !== undefined && (
            <span className="font-mono text-[16px] leading-none text-[var(--qz-fg-4)]">
              /{total}
            </span>
          )}
          {sub && <span className="text-[11px] text-[var(--qz-fg-4)] ml-1">{sub}</span>}
        </div>
      </div>
    </div>
  );
}
