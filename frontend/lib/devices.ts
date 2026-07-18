// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Shared data layer for live infrastructure state from the CloudSDK gateway
// (owgw). One `/api/v1/devices?deviceWithStatus=true` call returns every device
// merged with its connection status; the Dashboard, Venues, Notifications and
// Clients views all derive from this single snapshot so they agree with each
// other. Everything here is real owgw data — fields the gateway doesn't report
// are left `undefined` and the UI degrades to "—" rather than inventing values.

import { cloudsdkApi } from "@/lib/api";

/** A device merged with its live connection status, as owgw returns it. */
export interface Device {
  serialNumber: string;
  /** owgw uses the serial as the device name unless a friendly name is set. */
  name: string;
  deviceType?: string;
  /** owprov venue id this device belongs to. */
  venue?: string;
  connected: boolean;
  /** Firmware revision string, e.g. "TIP-v2.x… / 3.5.30". */
  firmware?: string;
  ipAddress?: string;
  /** Epoch seconds of the last gateway contact. */
  lastContact?: number;
  /** Epoch seconds the current connection was established ("connected since"). */
  started?: number;
  /** Cumulative bytes over the current connection, when reported. */
  txBytes?: number;
  rxBytes?: number;
  /** Device temperature in °C, when the platform reports it. */
  temperature?: number;
  associations2G: number;
  associations5G: number;
  associations6G: number;
}

interface RawDevice {
  serialNumber?: string;
  name?: string;
  deviceType?: string;
  venue?: string;
  connected?: boolean;
  firmware?: string;
  ipAddress?: string;
  lastContact?: number;
  started?: number;
  txBytes?: number;
  rxBytes?: number;
  temperature?: number;
  associations_2G?: number;
  associations_5G?: number;
  associations_6G?: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/// owgw returns devices under `devicesWithStatus` / `devices`; tolerate a bare
/// array too.
function extractRaw(raw: unknown): RawDevice[] {
  if (Array.isArray(raw)) return raw as RawDevice[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["devicesWithStatus", "devices"]) {
      if (Array.isArray(obj[key])) return obj[key] as RawDevice[];
    }
  }
  return [];
}

function normalize(d: RawDevice): Device {
  const serial = d.serialNumber ?? "";
  return {
    serialNumber: serial,
    name: d.name?.trim() || serial,
    deviceType: d.deviceType,
    venue: d.venue,
    connected: !!d.connected,
    firmware: d.firmware?.trim() || undefined,
    ipAddress: d.ipAddress,
    lastContact: d.lastContact,
    started: d.started,
    txBytes: typeof d.txBytes === "number" ? d.txBytes : undefined,
    rxBytes: typeof d.rxBytes === "number" ? d.rxBytes : undefined,
    temperature: typeof d.temperature === "number" ? d.temperature : undefined,
    associations2G: num(d.associations_2G),
    associations5G: num(d.associations_5G),
    associations6G: num(d.associations_6G),
  };
}

/** Total associated wireless clients across all bands for a device. */
export function clientCount(d: Device): number {
  return d.associations2G + d.associations5G + d.associations6G;
}

/// Every device with live status. Returns an empty list (never throws) when
/// owgw is unreachable, so callers degrade to zeros rather than failing.
export async function fetchDevices(): Promise<Device[]> {
  try {
    const raw = await cloudsdkApi<unknown>(
      "/api/v1/devices?deviceWithStatus=true&limit=1000",
    );
    return extractRaw(raw).map(normalize);
  } catch {
    return [];
  }
}

/// Group a device list by venue id. Devices with no venue are dropped (they
/// can't be attributed to any site in the Organization tree).
export function groupDevicesByVenue(devices: Device[]): Map<string, Device[]> {
  const byVenue = new Map<string, Device[]>();
  for (const d of devices) {
    if (!d.venue) continue;
    const list = byVenue.get(d.venue) ?? [];
    list.push(d);
    byVenue.set(d.venue, list);
  }
  return byVenue;
}

/// Human-readable byte size, e.g. 1536 → "1.5 KB".
export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/// Compact "connected for"/uptime label from an epoch-seconds start time, e.g.
/// "3 Days", "5 Hours", "12 Minutes". Empty input → "—".
export function formatDuration(fromEpochSeconds?: number): string {
  if (!fromEpochSeconds) return "—";
  const secs = Math.floor(Date.now() / 1000) - fromEpochSeconds;
  if (secs < 0) return "—";
  const units: [number, string][] = [
    [86400 * 30, "Month"],
    [86400, "Day"],
    [3600, "Hour"],
    [60, "Minute"],
    [1, "Second"],
  ];
  for (const [size, label] of units) {
    const n = Math.floor(secs / size);
    if (n >= 1) return `${n} ${label}${n === 1 ? "" : "s"}`;
  }
  return "0 Seconds";
}
