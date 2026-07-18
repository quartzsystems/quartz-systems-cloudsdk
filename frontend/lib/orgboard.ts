// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Data layer for the Organizations table. Lists the organizations under the
// currently-scoped Organization (its direct sub-organizations, or the scoped
// Organization itself when it has none) and enriches each with live owgw device
// state aggregated over its whole subtree: online/total infrastructure, venues
// that are up, connected clients, and cumulative traffic counters. Alarm state
// is derived from connectivity exactly as the Dashboard and Venues views do
// (>30% of infrastructure offline ⇒ critical, any offline ⇒ major). Country is
// best-effort from owprov venue locations; when absent the UI shows "—" rather
// than inventing one.

import { provisioningApi } from "@/lib/api";
import {
  clientCount,
  Device,
  fetchDevices,
  groupDevicesByVenue,
  inventorySummary,
} from "@/lib/devices";
import { collectVenues, OrgNode } from "@/lib/organizations";

/** Fraction of an org's infrastructure that must be offline for a critical. */
const CRITICAL_RATIO = 0.3;

export interface OrgStat {
  id: string;
  name: string;
  critical: boolean;
  major: boolean;
  /** Fully dark: has infrastructure but none of it is online. */
  offline: boolean;
  infraOnline: number;
  infraTotal: number;
  venuesOnline: number;
  venueTotal: number;
  clients: number;
  /** Cumulative bytes across the org's devices (real owgw counters). */
  txBytes: number;
  rxBytes: number;
  /** Inventory summary by device class, e.g. "9 APs" / "1 AP, 1 Switch". */
  inventory: string;
  /** Most common two-letter country code across the org's venues, when known. */
  country?: string;
}

export interface OrgBoard {
  orgs: OrgStat[];
  /** Tab counts. */
  total: number;
  issues: number;
  offline: number;
}

export const EMPTY_ORG_BOARD: OrgBoard = { orgs: [], total: 0, issues: 0, offline: 0 };

/// Pull a two-letter country code out of an owprov venue's location, tolerating
/// the several shapes owprov uses (a `location`/`locations` object, or a plain
/// `country` field). Returns undefined when nothing usable is present.
function deriveCountry(raw: Record<string, unknown>): string | undefined {
  const direct = raw.country;
  if (typeof direct === "string" && direct.trim()) return direct.trim().toUpperCase().slice(0, 2);
  const loc = (raw.location ??
    (Array.isArray(raw.locations) ? raw.locations[0] : undefined)) as
    | Record<string, unknown>
    | undefined;
  if (loc && typeof loc === "object" && typeof loc.country === "string" && loc.country.trim()) {
    return (loc.country as string).trim().toUpperCase().slice(0, 2);
  }
  return undefined;
}

/// Best-effort map of venue id → country code from the owprov venue list.
/// Never throws — an unreachable service just yields an empty map ("—").
async function fetchVenueCountries(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const raw = await provisioningApi<unknown>("/api/v1/venue");
    const list = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).venues)
          ? ((raw as Record<string, unknown>).venues as unknown[])
          : []);
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const v = item as Record<string, unknown>;
      const id = typeof v.id === "string" ? v.id : undefined;
      const country = deriveCountry(v);
      if (id && country) map.set(id, country);
    }
  } catch {
    /* owprov unreachable — leave the map empty */
  }
  return map;
}

/// Aggregate one organization's subtree into a stat row.
function statFor(org: OrgNode, byVenue: Map<string, Device[]>, countryOf: Map<string, string>): OrgStat {
  const venues = collectVenues(org);
  let infraOnline = 0;
  let venuesOnline = 0;
  let clients = 0;
  let txBytes = 0;
  let rxBytes = 0;
  const allDevices: Device[] = [];
  const countryCounts = new Map<string, number>();

  for (const v of venues) {
    const devices = byVenue.get(v.id) ?? [];
    const online = devices.filter((d) => d.connected).length;
    infraOnline += online;
    if (devices.length > 0 && online > 0) venuesOnline += 1;
    for (const d of devices) {
      allDevices.push(d);
      clients += clientCount(d);
      txBytes += d.txBytes ?? 0;
      rxBytes += d.rxBytes ?? 0;
    }
    const c = countryOf.get(v.id);
    if (c) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
  }
  const infraTotal = allDevices.length;

  const offlineCount = infraTotal - infraOnline;
  const critical = infraTotal > 0 && offlineCount / infraTotal > CRITICAL_RATIO;
  const major = !critical && offlineCount > 0;

  let country: string | undefined;
  let bestN = 0;
  for (const [c, n] of countryCounts) {
    if (n > bestN) {
      country = c;
      bestN = n;
    }
  }

  return {
    id: org.id,
    name: org.name,
    critical,
    major,
    offline: infraTotal > 0 && infraOnline === 0,
    infraOnline,
    infraTotal,
    venuesOnline,
    venueTotal: venues.length,
    clients,
    txBytes,
    rxBytes,
    inventory: inventorySummary(allDevices),
    country,
  };
}

/// The organizations to list under `node`: its direct sub-organizations, or the
/// node itself when it has none (so a leaf customer org still shows a row for
/// its own estate rather than an empty table).
function orgsToList(node: OrgNode): OrgNode[] {
  const children = node.children.filter((c) => c.kind === "organization");
  return children.length > 0 ? children : [node];
}

/// Assemble the Organizations board for the currently-scoped `node`.
export async function loadOrgBoard(node: OrgNode): Promise<OrgBoard> {
  const [byVenue, countryOf] = await Promise.all([
    fetchDevices().then(groupDevicesByVenue),
    fetchVenueCountries(),
  ]);

  const orgs = orgsToList(node)
    .map((org) => statFor(org, byVenue, countryOf))
    .sort((a, b) => a.name.localeCompare(b.name));

  const issues = orgs.filter((o) => o.critical || o.major).length;
  const offline = orgs.filter((o) => o.offline).length;
  return { orgs, total: orgs.length, issues, offline };
}
