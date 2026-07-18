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

import {
  clientCount,
  Device,
  fetchDevices,
  groupDevicesByVenue,
} from "@/lib/devices";
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

/// Assemble the Organization-scoped dashboard: every venue under `orgNode`,
/// enriched with live owgw device state.
export async function loadDashboard(orgNode: OrgNode): Promise<DashboardData> {
  const venues = collectVenues(orgNode);
  const byVenue = groupDevicesByVenue(await fetchDevices());

  const rows: VenueRow[] = venues.map((v) => {
    const devices: Device[] = byVenue.get(v.id) ?? [];
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
