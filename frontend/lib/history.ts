// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Local history for the Dashboard's Historical Trends. The CloudSDK deployment
// here exposes owsec/owprov/owgw but no long-term analytics service, so instead
// of fabricating a series the console records the real KPI values it observes,
// one snapshot per day per Organization, in localStorage. The trend charts read
// the last N days back. This "starts populating" honestly from day one (a single
// point) and fills in as the console is used; it can be replaced by a real
// analytics feed later without touching the charts.

export interface DailyPoint {
  /** ISO date, e.g. "2026-07-18". */
  day: string;
  alarmVenues: number;
  infraOnline: number;
  throughputMbps: number;
  clients: number;
}

export type Metric = keyof Omit<DailyPoint, "day">;

const KEY_PREFIX = "quartz-cloudsdk-history:";
const MAX_DAYS = 90;

function key(orgId: string): string {
  return `${KEY_PREFIX}${orgId}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function read(orgId: string): DailyPoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(orgId));
    const parsed = raw ? (JSON.parse(raw) as DailyPoint[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/// Record today's observed values for `orgId` (replacing any earlier snapshot
/// from the same day), then return the trailing history. Safe to call on every
/// dashboard load.
export function recordSnapshot(
  orgId: string,
  values: Omit<DailyPoint, "day">,
): DailyPoint[] {
  const point: DailyPoint = { day: today(), ...values };
  const rest = read(orgId).filter((p) => p.day !== point.day);
  const next = [...rest, point].slice(-MAX_DAYS);
  try {
    localStorage.setItem(key(orgId), JSON.stringify(next));
  } catch {
    /* storage unavailable — return the in-memory series anyway */
  }
  return next;
}

/// The last `days` of history for `orgId`, oldest first.
export function readHistory(orgId: string, days: number): DailyPoint[] {
  return read(orgId).slice(-days);
}
