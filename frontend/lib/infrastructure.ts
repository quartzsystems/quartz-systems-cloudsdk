// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Data layer for the Infrastructure view — the physical access points, switches
// and gateways owgw manages for the currently-scoped Organization. Every device
// is real owgw state (lib/devices): a single `/api/v1/devices?deviceWithStatus`
// call, filtered to the venues in scope and enriched with its class (heuristic,
// see lib/devices) and the friendly venue name from the owprov tree. Fields owgw
// doesn't report stay undefined so the table shows "—" rather than guessing.

import { firmwareApi, provisioningApi } from "@/lib/api";
import {
  clientCount,
  Device,
  DeviceClass,
  deviceClass,
  fetchDevices,
} from "@/lib/devices";
import { collectVenues, OrgNode } from "@/lib/organizations";

export interface InfraDevice extends Device {
  /** Physical class (heuristic from deviceType). */
  klass: DeviceClass;
  /** Friendly venue name from the owprov tree, when the venue is known. */
  venueName?: string;
  /** Associated wireless clients across all bands. */
  clients: number;
}

export interface InfraBoard {
  devices: InfraDevice[];
  online: number;
  offline: number;
}

export const EMPTY_INFRA_BOARD: InfraBoard = { devices: [], online: 0, offline: 0 };

/// Load every device in `node`'s scope, enriched for the table. Devices with no
/// venue (or a venue outside the scope) are dropped so the list stays
/// Organization-scoped like every other view.
export async function loadInfrastructure(node: OrgNode): Promise<InfraBoard> {
  const venues = collectVenues(node);
  const nameOf = new Map(venues.map((v) => [v.id, v.name] as const));
  const scope = new Set(venues.map((v) => v.id));

  const devices: InfraDevice[] = (await fetchDevices())
    .filter((d) => d.venue && scope.has(d.venue))
    .map((d) => ({
      ...d,
      klass: deviceClass(d.deviceType),
      venueName: d.venue ? nameOf.get(d.venue) : undefined,
      clients: clientCount(d),
    }))
    // Offline first (they need attention), then by name.
    .sort((a, b) =>
      a.connected === b.connected ? a.name.localeCompare(b.name) : a.connected ? 1 : -1,
    );

  const online = devices.filter((d) => d.connected).length;
  return { devices, online, offline: devices.length - online };
}

// ── Adding infrastructure ────────────────────────────────────────────────────

/** Device types offered when owfms/the fleet report none. */
const DEFAULT_DEVICE_TYPES = [
  "EAP-101",
  "EAP-102",
  "EAP-104",
  "ECW5211",
  "ECW5410",
];

function extractStrings(raw: unknown, key: string): string[] {
  const val = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)[key]
      : undefined;
  return Array.isArray(val) ? val.filter((s): s is string => typeof s === "string" && !!s) : [];
}

/// Device types to offer in the Add-infrastructure form. Prefers owfms's known
/// set, then the distinct types already present in the live fleet (guaranteed
/// to be strings owgw accepts), and finally a small static fallback so the form
/// always works even with both services quiet.
export async function fetchDeviceTypes(): Promise<string[]> {
  try {
    const raw = await firmwareApi<unknown>("/api/v1/firmwares?deviceSet=true");
    const list = extractStrings(raw, "deviceTypes");
    if (list.length) return list.sort();
  } catch {
    /* owfms quiet — fall through */
  }
  try {
    const fleet = new Set<string>();
    for (const d of await fetchDevices()) if (d.deviceType) fleet.add(d.deviceType);
    if (fleet.size) return [...fleet].sort();
  } catch {
    /* owgw quiet — fall through */
  }
  return DEFAULT_DEVICE_TYPES;
}

export interface InfraDraft {
  /** MAC address as typed; normalised to the owprov serial on submit. This is
   *  the only field the create call needs — the rest are form dressing. */
  mac: string;
  name: string;
  deviceType: string;
  /** Venue id the device is provisioned into. */
  venue: string;
  serialNumber: string;
  assetTag: string;
  /** Provision a record without a physical device backing it. */
  shell: boolean;
}

/** owprov keys infrastructure by the device serial — the MAC, hex only. */
export function normalizeSerial(mac: string): string {
  return mac.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

/** A MAC is well-formed once it reduces to exactly 12 hex digits. */
export function isValidMac(mac: string): boolean {
  return normalizeSerial(mac).length === 12;
}

/// Register a device by MAC. owprov keys the inventory record on the serial
/// (the MAC, hex only), which is all the create needs.
export async function createInfrastructure(mac: string): Promise<void> {
  const serial = normalizeSerial(mac);
  await provisioningApi(`/api/v1/inventory/${serial}`, {
    method: "POST",
    body: JSON.stringify({ serialNumber: serial }),
  });
}
