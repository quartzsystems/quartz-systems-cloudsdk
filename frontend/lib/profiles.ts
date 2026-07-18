// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Data layer for the Profiles view — the device configuration profiles owprov
// holds for the current Organization (owprov "configurations"). Each profile is
// classified as Access Point / RF / Switch, and resolved to the friendly
// organization + venue names from the owprov tree. owprov's configuration schema
// is deployment-specific, so every field is read defensively and the view
// degrades to an empty state rather than guessing when the service is quiet.

import { provisioningApi } from "@/lib/api";
import { deviceClass } from "@/lib/devices";
import { collectOrgs, collectVenues, OrgNode } from "@/lib/organizations";

export type ProfileType = "ap" | "rf" | "switch";

export interface Profile {
  id: string;
  name: string;
  description?: string;
  type: ProfileType;
  /** Base/default profile provisioned with the organization. */
  isDefault: boolean;
  /** Number of devices using this profile. */
  usedBy: number;
  orgName?: string;
  venueNames: string[];
}

export interface ProfileBoard {
  profiles: Profile[];
  counts: Record<ProfileType, number>;
  total: number;
}

export const EMPTY_PROFILE_BOARD: ProfileBoard = {
  profiles: [],
  counts: { ap: 0, rf: 0, switch: 0 },
  total: 0,
};

export const PROFILE_TYPE_LABEL: Record<ProfileType, string> = {
  ap: "Access Point",
  rf: "RF",
  switch: "Switch",
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const asNum = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const asBool = (v: unknown): boolean | undefined =>
  typeof v === "boolean" ? v : undefined;

function extractList(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  const val = asRecord(raw)[key];
  return Array.isArray(val) ? val : [];
}

/// Best-effort classification of a configuration into AP / RF / Switch. Prefers
/// an explicit type field, then a name/description hint, then the device types
/// the profile targets. Falls back to Access Point (the common case).
function deriveType(r: Record<string, unknown>): ProfileType {
  const explicit = (asStr(r.type) ?? asStr(r.profileType) ?? asStr(r.deviceMode) ?? "").toLowerCase();
  if (explicit.includes("rf")) return "rf";
  if (explicit.includes("switch")) return "switch";
  if (explicit.includes("access") || explicit === "ap") return "ap";

  const hay = `${asStr(r.name) ?? ""} ${asStr(r.description) ?? ""}`.toLowerCase();
  if (/\brf\b/.test(hay) || hay.includes("radio")) return "rf";
  if (hay.includes("switch")) return "switch";

  const deviceTypes = asArray(r.deviceTypes).map(asStr).filter(Boolean) as string[];
  if (deviceTypes.some((dt) => deviceClass(dt) === "switch")) return "switch";
  return "ap";
}

/// Devices-in-use count, tolerating a list of serials or a numeric field.
function deriveUsedBy(r: Record<string, unknown>): number {
  if (Array.isArray(r.inUse)) return r.inUse.length;
  return asNum(r.inUse) ?? asNum(r.deviceCount) ?? asNum(r.usedBy) ?? 0;
}

/// Venue ids a profile is attached to (an array, or a single `venue`).
function deriveVenueIds(r: Record<string, unknown>): string[] {
  const arr = asArray(r.venues).map(asStr).filter(Boolean) as string[];
  if (arr.length) return arr;
  const single = asStr(r.venue);
  return single ? [single] : [];
}

/// Load the configuration profiles in `node`'s scope. Profiles that name an
/// entity or venue outside the scope are dropped; those with no identifiable
/// scope are kept so a differing schema doesn't hide everything.
export async function loadProfiles(node: OrgNode): Promise<ProfileBoard> {
  const orgName = new Map(collectOrgs(node).map((o) => [o.id, o.name] as const));
  const venueName = new Map(collectVenues(node).map((v) => [v.id, v.name] as const));
  const orgIds = new Set(orgName.keys());
  const venueIds = new Set(venueName.keys());

  let raw: unknown;
  try {
    raw = await provisioningApi<unknown>("/api/v1/configurations");
  } catch {
    return EMPTY_PROFILE_BOARD;
  }

  const profiles: Profile[] = [];
  extractList(raw, "configurations").forEach((item, i) => {
    const r = asRecord(item);
    const entity = asStr(r.entity);
    const vids = deriveVenueIds(r);
    const inScope =
      (entity ? orgIds.has(entity) : false) ||
      vids.some((v) => venueIds.has(v)) ||
      (!entity && vids.length === 0);
    if (!inScope) return;

    const name = asStr(r.name) ?? "Untitled";
    profiles.push({
      id: asStr(r.id) ?? `${name}-${i}`,
      name,
      description: asStr(r.description),
      type: deriveType(r),
      isDefault: asBool(r.default) ?? asBool(r.isDefault) ?? name.toLowerCase() === "base",
      usedBy: deriveUsedBy(r),
      orgName: entity ? orgName.get(entity) : undefined,
      venueNames: vids.map((v) => venueName.get(v) ?? v),
    });
  });

  profiles.sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  const counts: Record<ProfileType, number> = { ap: 0, rf: 0, switch: 0 };
  for (const p of profiles) counts[p.type] += 1;
  return { profiles, counts, total: profiles.length };
}
