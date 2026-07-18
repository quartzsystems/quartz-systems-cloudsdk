// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Data layer for the Notifications view. The CloudSDK deployment here exposes no
// dedicated alarms service, so — exactly as the Dashboard's Site-Alarms do — we
// derive alarms from real owgw device connectivity:
//
//   • a venue with more than 30% of its infrastructure offline raises a
//     **critical** "lost connection to >30% of the venue infrastructures" alarm;
//   • every individual offline device raises a **major** "lost connection to the
//     <device>" alarm.
//
// The alarm's timestamp is the device's last gateway contact (when it actually
// went offline), so "created" is real, not invented. To back the Actionable /
// Historical split honestly, we keep a per-Organization alarm log in
// localStorage: active alarms are Actionable; when an alarm stops appearing it
// is stamped cleared and moves to Historical. The log starts empty and fills in
// as the console observes real state — it never fabricates history.

import { Device, fetchDevices, groupDevicesByVenue } from "@/lib/devices";
import { groupVenuesByOrg, OrgNode } from "@/lib/organizations";

/** Fraction of a venue's infrastructure that must be offline for a critical. */
const VENUE_CRITICAL_RATIO = 0.3;

export type Severity = "critical" | "major";
export type AffectsKind = "venue" | "device";

export interface Notification {
  /** Stable id (survives reloads) used to reconcile Actionable ↔ Historical. */
  id: string;
  type: "alarm";
  severity: Severity;
  summary: string;
  /** Name of the affected device or venue. */
  affects: string;
  affectsKind: AffectsKind;
  /** Real underlying identifier shown in the ID column (serial / venue id). */
  ref: string;
  venueId: string;
  venueName: string;
  orgId: string;
  orgName: string;
  /** Epoch ms the condition began (device's last contact), when known. */
  createdAt?: number;
  /** Epoch ms the alarm cleared; set only on Historical rows. */
  clearedAt?: number;
}

interface VenueMeta {
  venueName: string;
  orgId: string;
  orgName: string;
}

/// Map every venue in `node`'s scope to its name and owning Organization.
function venueMetaMap(node: OrgNode): Map<string, VenueMeta> {
  const map = new Map<string, VenueMeta>();
  for (const group of groupVenuesByOrg(node)) {
    for (const v of group.venues) {
      map.set(v.id, {
        venueName: v.name,
        orgId: group.org.id,
        orgName: group.org.name,
      });
    }
  }
  return map;
}

/// Build the currently-active alarms for `node` from live owgw device state.
function buildActive(node: OrgNode, devices: Device[]): Notification[] {
  const meta = venueMetaMap(node);
  const byVenue = groupDevicesByVenue(devices);
  const out: Notification[] = [];

  for (const [venueId, m] of meta) {
    const venueDevices = byVenue.get(venueId) ?? [];
    const total = venueDevices.length;
    if (total === 0) continue;
    const offline = venueDevices.filter((d) => !d.connected);
    if (offline.length === 0) continue;

    // Venue-level critical when more than 30% of infrastructure is offline.
    if (offline.length / total > VENUE_CRITICAL_RATIO) {
      const createdAt = earliestContact(offline);
      out.push({
        id: `alarm:venue:${venueId}`,
        type: "alarm",
        severity: "critical",
        summary: "Cloud has lost connection to more than 30% of the venue infrastructures",
        affects: m.venueName,
        affectsKind: "venue",
        ref: venueId,
        venueId,
        venueName: m.venueName,
        orgId: m.orgId,
        orgName: m.orgName,
        createdAt,
      });
    }

    // Device-level major for each offline device.
    for (const d of offline) {
      out.push({
        id: `alarm:device:${d.serialNumber}`,
        type: "alarm",
        severity: "major",
        summary: `Cloud has lost connection to ${d.name}`,
        affects: d.name,
        affectsKind: "device",
        ref: d.serialNumber,
        venueId,
        venueName: m.venueName,
        orgId: m.orgId,
        orgName: m.orgName,
        createdAt: d.lastContact ? d.lastContact * 1000 : undefined,
      });
    }
  }

  return out;
}

/// Earliest last-contact (epoch ms) among devices, i.e. when the venue's
/// trouble began. Undefined when none report a contact time.
function earliestContact(devices: Device[]): number | undefined {
  const times = devices
    .map((d) => d.lastContact)
    .filter((t): t is number => typeof t === "number" && t > 0);
  return times.length ? Math.min(...times) * 1000 : undefined;
}

// ── Alarm log (localStorage) ────────────────────────────────────────────────

const KEY_PREFIX = "quartz-cloudsdk-alarms:";
const MAX_LOG = 2000;

function logKey(orgId: string): string {
  return `${KEY_PREFIX}${orgId}`;
}

function readLog(orgId: string): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(logKey(orgId));
    const parsed = raw ? (JSON.parse(raw) as Notification[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLog(orgId: string, log: Notification[]): void {
  try {
    localStorage.setItem(logKey(orgId), JSON.stringify(log.slice(-MAX_LOG)));
  } catch {
    /* storage unavailable — the in-memory result is still returned */
  }
}

export interface NotificationBoard {
  actionable: Notification[];
  historical: Notification[];
}

/// Load the Notifications board for the scoped Organization: fetch live device
/// state, derive the active alarms, and reconcile against the stored log so
/// cleared alarms surface under Historical. `scopeKey` keys the log (the current
/// selection id) so switching scope keeps separate logs.
export async function loadNotifications(
  node: OrgNode,
  scopeKey: string,
): Promise<NotificationBoard> {
  const devices = await fetchDevices();
  const active = buildActive(node, devices);
  const activeById = new Map(active.map((a) => [a.id, a]));

  const prior = readLog(scopeKey);
  const priorById = new Map(prior.map((p) => [p.id, p]));
  const now = Date.now();

  // Merge: keep each alarm's first-observed createdAt; refresh active ones and
  // stamp any that stopped appearing as cleared.
  const merged = new Map<string, Notification>();
  for (const p of prior) merged.set(p.id, p);

  for (const a of active) {
    const p = priorById.get(a.id);
    merged.set(a.id, {
      ...a,
      // Prefer the real onset time; fall back to when we first logged it.
      createdAt: a.createdAt ?? p?.createdAt ?? now,
      clearedAt: undefined,
    });
  }
  for (const p of prior) {
    if (!activeById.has(p.id) && !p.clearedAt) {
      merged.set(p.id, { ...p, clearedAt: now });
    }
  }

  const all = [...merged.values()];
  writeLog(scopeKey, all);

  const actionable = all
    .filter((n) => !n.clearedAt)
    .sort(sortBySeverityThenTime);
  const historical = all
    .filter((n) => n.clearedAt)
    .sort((a, b) => (b.clearedAt ?? 0) - (a.clearedAt ?? 0));

  return { actionable, historical };
}

/// Critical before major, then newest first.
function sortBySeverityThenTime(a: Notification, b: Notification): number {
  if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
}

/// Relative age label like "8 Days ago", "3 Hours ago", "Just now".
export function timeAgo(epochMs?: number): string {
  if (!epochMs) return "—";
  const secs = Math.floor((Date.now() - epochMs) / 1000);
  if (secs < 60) return "Just now";
  const units: [number, string][] = [
    [86400 * 30, "Month"],
    [86400, "Day"],
    [3600, "Hour"],
    [60, "Minute"],
  ];
  for (const [size, label] of units) {
    const n = Math.floor(secs / size);
    if (n >= 1) return `${n} ${label}${n === 1 ? "" : "s"} ago`;
  }
  return "Just now";
}
