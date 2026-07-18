// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Data layer for the Clients view. owgw has no global client list, so we read
// each connected device's latest reported state (`/api/v1/device/{serial}/
// statistics?lastOnly=true`) and extract the real per-client detail it carries:
//
//   • wireless clients from `interfaces[].ssids[].associations[]` — MAC, IP,
//     SSID (network), connected time, RSSI, VLAN, and band/channel resolved
//     against the device's `radios[]`;
//   • wired clients from `interfaces[].clients[]` — MAC and IP.
//
// Everything is real device telemetry; fields a device doesn't report stay
// undefined and the table shows "—". Only devices in the scoped Organization's
// venues are queried, so the list is Organization-scoped like every other view.

import { cloudsdkApi } from "@/lib/api";
import { Device, fetchDevices } from "@/lib/devices";
import { groupVenuesByOrg, OrgNode } from "@/lib/organizations";

export type ClientKind = "wireless" | "wired";

export interface Client {
  /** Stable-ish key: device serial + MAC. */
  key: string;
  kind: ClientKind;
  mac: string;
  ip?: string;
  vlan?: number;
  identity?: string;
  /** SSID for wireless clients. */
  network?: string;
  /** The AP/switch the client is on. */
  deviceName: string;
  deviceSerial: string;
  venueId?: string;
  connectedSeconds?: number;
  band?: string;
  channel?: number;
  rssi?: number;
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asNum = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const asStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Band label from a Wi-Fi channel number, when the radio didn't name one. */
function bandFromChannel(ch?: number): string | undefined {
  if (ch === undefined) return undefined;
  if (ch >= 1 && ch <= 14) return "2G";
  if (ch >= 32 && ch <= 177) return "5G";
  if (ch > 177) return "6G";
  return undefined;
}

/** Normalize the assorted band spellings owgw emits to 2G / 5G / 6G. */
function normBand(v: unknown): string | undefined {
  const s = asStr(v)?.toUpperCase();
  if (!s) return undefined;
  if (s.startsWith("2")) return "2G";
  if (s.startsWith("6")) return "6G";
  if (s.startsWith("5")) return "5G";
  return s;
}

interface Radio {
  channel?: number;
  band?: string;
}

/// Resolve an ssid's radio (by `$ref` index or numeric index) to {band, channel}.
function radioFor(ssid: Record<string, unknown>, radios: Radio[]): Radio {
  const ref = ssid.radio;
  let idx: number | undefined;
  if (typeof ref === "number") idx = ref;
  else {
    const refStr = asRecord(ref)["$ref"];
    if (typeof refStr === "string") {
      const m = refStr.match(/(\d+)\s*$/);
      if (m) idx = Number(m[1]);
    }
  }
  return idx !== undefined && radios[idx] ? radios[idx] : {};
}

/// Pull the last reported state for a device and turn it into client rows.
async function clientsForDevice(d: Device): Promise<Client[]> {
  let raw: unknown;
  try {
    raw = await cloudsdkApi<unknown>(
      `/api/v1/device/${encodeURIComponent(d.serialNumber)}/statistics?lastOnly=true`,
    );
  } catch {
    return []; // device state unavailable — skip it, don't fail the whole page
  }

  // The state may be returned bare or wrapped under `data`.
  const wrapper = asRecord(raw);
  const state = asRecord(wrapper.data ?? raw);

  const radios: Radio[] = asArray(state.radios).map((r) => {
    const ro = asRecord(r);
    return { channel: asNum(ro.channel), band: normBand(ro.band) };
  });

  const out: Client[] = [];

  for (const iface of asArray(state.interfaces)) {
    const io = asRecord(iface);

    // Wireless associations, grouped under each SSID.
    for (const ssid of asArray(io.ssids)) {
      const so = asRecord(ssid);
      const network = asStr(so.ssid);
      const radio = radioFor(so, radios);
      const ssidBand = normBand(so.band) ?? radio.band;
      const channel = asNum(so.channel) ?? radio.channel;
      const band = ssidBand ?? bandFromChannel(channel);

      for (const assoc of asArray(so.associations)) {
        const a = asRecord(assoc);
        const mac = asStr(a.station) ?? asStr(a.mac);
        if (!mac) continue;
        out.push({
          key: `${d.serialNumber}:${mac}`,
          kind: "wireless",
          mac,
          ip: asStr(a.ipaddr_v4) ?? asStr(a.ip),
          vlan: asNum(a.vlan),
          identity: asStr(a.identity),
          network,
          deviceName: d.name,
          deviceSerial: d.serialNumber,
          venueId: d.venue,
          connectedSeconds: asNum(a.connected),
          band,
          channel,
          rssi: asNum(a.rssi),
        });
      }
    }

    // Wired clients on the interface, when reported.
    for (const client of asArray(io.clients)) {
      const c = asRecord(client);
      const mac = asStr(c.mac);
      if (!mac) continue;
      const ipv4 = asArray(c.ipv4_addresses).map(asStr).find(Boolean);
      out.push({
        key: `${d.serialNumber}:wired:${mac}`,
        kind: "wired",
        mac,
        ip: ipv4 ?? asStr(c.ip),
        deviceName: d.name,
        deviceSerial: d.serialNumber,
        venueId: d.venue,
      });
    }
  }

  return out;
}

/// The set of venue ids in `node`'s scope, so we only query devices that belong
/// to the current Organization.
function venuesInScope(node: OrgNode): Set<string> {
  const ids = new Set<string>();
  for (const group of groupVenuesByOrg(node)) {
    for (const v of group.venues) ids.add(v.id);
  }
  return ids;
}

/// Every client across the scoped Organization's connected devices. Devices
/// whose state can't be fetched are simply skipped.
export async function loadClients(node: OrgNode): Promise<Client[]> {
  const scope = venuesInScope(node);
  const devices = (await fetchDevices()).filter(
    (d) => d.connected && d.venue && scope.has(d.venue),
  );

  const results = await Promise.allSettled(devices.map(clientsForDevice));
  const clients: Client[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") clients.push(...r.value);
  }
  // Newest connections first (longest-connected last), stable for display.
  clients.sort((a, b) => (a.connectedSeconds ?? 0) - (b.connectedSeconds ?? 0));
  return clients;
}
