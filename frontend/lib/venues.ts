// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Data layer for the Venues view. The venue list is real (owprov, via the
// Organization tree); each venue is enriched with live owgw device state
// (lib/devices): online/total infrastructure, connected clients, cumulative
// traffic counters, firmware release, peak temperature, and uptime. Alarm state
// is derived from connectivity the same way the Dashboard and Notifications do
// (>30% of infrastructure offline ⇒ critical, any offline ⇒ major). Fields owgw
// doesn't report stay undefined so the table shows "—" instead of guessing.

import {
  clientCount,
  Device,
  fetchDevices,
  groupDevicesByVenue,
} from "@/lib/devices";
import { groupVenuesByOrg, OrgNode } from "@/lib/organizations";

/** Fraction of a venue's infrastructure that must be offline for a critical. */
const VENUE_CRITICAL_RATIO = 0.3;

export interface VenueStat {
  id: string;
  name: string;
  critical: boolean;
  major: boolean;
  infraOnline: number;
  infraTotal: number;
  clients: number;
  /** Cumulative bytes across the venue's devices (real owgw counters). */
  txBytes: number;
  rxBytes: number;
  /** Most common firmware revision across the venue's devices. */
  firmware?: string;
  /** Highest device temperature reported in the venue, °C. */
  peakTempC?: number;
  /** Average uptime in seconds across connected devices (connected-since). */
  avgUptimeSeconds?: number;
}

export interface VenueOrgGroup {
  org: OrgNode;
  venues: VenueStat[];
}

export interface VenueBoard {
  groups: VenueOrgGroup[];
  /** Venues with any active alarm / total venues in scope. */
  alarmVenues: number;
  venueTotal: number;
  clients: number;
  infraOnline: number;
  infraTotal: number;
}

/// Most frequently occurring firmware string among a venue's devices.
function commonFirmware(devices: Device[]): string | undefined {
  const counts = new Map<string, number>();
  for (const d of devices) {
    if (!d.firmware) continue;
    counts.set(d.firmware, (counts.get(d.firmware) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [fw, n] of counts) {
    if (n > bestN) {
      best = fw;
      bestN = n;
    }
  }
  return best;
}

function statFor(id: string, name: string, devices: Device[]): VenueStat {
  const infraTotal = devices.length;
  const infraOnline = devices.filter((d) => d.connected).length;
  const offline = infraTotal - infraOnline;
  const critical = infraTotal > 0 && offline / infraTotal > VENUE_CRITICAL_RATIO;
  const major = !critical && offline > 0;

  const temps = devices
    .map((d) => d.temperature)
    .filter((t): t is number => typeof t === "number");

  const uptimes = devices
    .filter((d) => d.connected && typeof d.started === "number" && d.started! > 0)
    .map((d) => Math.floor(Date.now() / 1000) - d.started!);

  return {
    id,
    name,
    critical,
    major,
    infraOnline,
    infraTotal,
    clients: devices.reduce((n, d) => n + clientCount(d), 0),
    txBytes: devices.reduce((n, d) => n + (d.txBytes ?? 0), 0),
    rxBytes: devices.reduce((n, d) => n + (d.rxBytes ?? 0), 0),
    firmware: commonFirmware(devices),
    peakTempC: temps.length ? Math.max(...temps) : undefined,
    avgUptimeSeconds: uptimes.length
      ? Math.floor(uptimes.reduce((a, b) => a + b, 0) / uptimes.length)
      : undefined,
  };
}

/// Assemble the Organization-scoped Venues board: every Organization under
/// `node` with its venues, each enriched with live owgw device state.
export async function loadVenueBoard(node: OrgNode): Promise<VenueBoard> {
  const byVenue = groupDevicesByVenue(await fetchDevices());
  const rawGroups = groupVenuesByOrg(node);

  let alarmVenues = 0;
  let venueTotal = 0;
  let clients = 0;
  let infraOnline = 0;
  let infraTotal = 0;

  const groups: VenueOrgGroup[] = rawGroups.map((g) => {
    const venues = g.venues.map((v) => {
      const stat = statFor(v.id, v.name, byVenue.get(v.id) ?? []);
      venueTotal += 1;
      if (stat.critical || stat.major) alarmVenues += 1;
      clients += stat.clients;
      infraOnline += stat.infraOnline;
      infraTotal += stat.infraTotal;
      return stat;
    });
    return { org: g.org, venues };
  });

  return { groups, alarmVenues, venueTotal, clients, infraOnline, infraTotal };
}
