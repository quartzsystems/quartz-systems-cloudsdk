// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Data layer for the Dashboard, scoped to the currently-selected Organization.
//
// The venue list is real (owprov, via the Organization tree). Live device state
// is enriched from the CloudSDK gateway (owgw) `/api/v1/devices` and grouped by
// venue: online/total infrastructure, connected clients, and — derived
// transparently from connectivity — active alarms (a venue with some
// infrastructure offline raises a "major" alarm; all-offline raises a
// "critical" one). When owgw is unreachable the venues still list and the
// counters read zero, matching the app's degrade-don't-fail pattern.

import { cloudsdkApi } from "@/lib/api";
import { collectVenues, OrgNode } from "@/lib/organizations";

export type Severity = "critical" | "major";

/** A venue row in the Site-Alarms table. */
export interface VenueRow {
  id: string;
  name: string;
  critical: number;
  major: number;
  infraOnline: number;
  infraTotal: number;
  clients: number;
  /** Human note like "1/3 offline", shown under the name. */
  offlineNote?: string;
}

export interface DashboardKpis {
  alarmVenues: number;
  venueTotal: number;
  infraOnline: number;
  infraTotal: number;
  firmwareFailed: number;
  firmwareTotal: number;
  clients: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  venues: VenueRow[];
}

interface OwgwDevice {
  serialNumber?: string;
  venue?: string;
  connected?: boolean;
  associations_2G?: number;
  associations_5G?: number;
  associations_6G?: number;
  // Some deployments report firmware-upgrade failure inline.
  upgradeStatus?: string;
}

/// owgw returns devices under `devicesWithStatus` / `devices`; tolerate a bare
/// array too.
function extractDevices(raw: unknown): OwgwDevice[] {
  if (Array.isArray(raw)) return raw as OwgwDevice[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["devicesWithStatus", "devices"]) {
      if (Array.isArray(obj[key])) return obj[key] as OwgwDevice[];
    }
  }
  return [];
}

function clientCount(d: OwgwDevice): number {
  return (d.associations_2G ?? 0) + (d.associations_5G ?? 0) + (d.associations_6G ?? 0);
}

/// Live device snapshot keyed by venue id. Empty when owgw is unreachable.
async function fetchDevicesByVenue(): Promise<Map<string, OwgwDevice[]>> {
  const byVenue = new Map<string, OwgwDevice[]>();
  try {
    const raw = await cloudsdkApi<unknown>("/api/v1/devices?deviceWithStatus=true&limit=1000");
    for (const d of extractDevices(raw)) {
      if (!d.venue) continue;
      const list = byVenue.get(d.venue) ?? [];
      list.push(d);
      byVenue.set(d.venue, list);
    }
  } catch {
    /* owgw down — leave the map empty; the dashboard degrades to zeros. */
  }
  return byVenue;
}

/// Assemble the Organization-scoped dashboard: every venue under `orgNode`,
/// enriched with live owgw device state.
export async function loadDashboard(orgNode: OrgNode): Promise<DashboardData> {
  const venues = collectVenues(orgNode);
  const byVenue = await fetchDevicesByVenue();

  const rows: VenueRow[] = venues.map((v) => {
    const devices = byVenue.get(v.id) ?? [];
    const infraTotal = devices.length;
    const infraOnline = devices.filter((d) => d.connected).length;
    const offline = infraTotal - infraOnline;
    const clients = devices.reduce((n, d) => n + clientCount(d), 0);
    // Derive alarm severity from connectivity (see file header).
    const critical = infraTotal > 0 && infraOnline === 0 ? 1 : 0;
    const major = offline > 0 && infraOnline > 0 ? 1 : 0;
    return {
      id: v.id,
      name: v.name,
      critical,
      major,
      infraOnline,
      infraTotal,
      clients,
      offlineNote: offline > 0 ? `${offline}/${infraTotal} offline` : undefined,
    };
  });

  const firmwareTotal = rows.reduce((n, r) => n + r.infraTotal, 0);
  const kpis: DashboardKpis = {
    alarmVenues: rows.filter((r) => r.critical + r.major > 0).length,
    venueTotal: venues.length,
    infraOnline: rows.reduce((n, r) => n + r.infraOnline, 0),
    infraTotal: firmwareTotal,
    firmwareFailed: 0,
    firmwareTotal,
    clients: rows.reduce((n, r) => n + r.clients, 0),
  };

  return { kpis, venues: rows };
}
