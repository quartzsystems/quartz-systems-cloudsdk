// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Settings for the currently-scoped Organization (entity) or Venue. Name and
// address live in owprov; both are reached through the /api/owprov/* proxy.

import { provisioningApi } from "@/lib/api";
import { OrgOption } from "@/lib/organizations";

export interface OrgSettings {
  name: string;
  address: string;
}

/// owprov endpoint for the current selection.
function objectPath(o: OrgOption): string {
  return o.kind === "venue" ? `/api/v1/venue/${o.id}` : `/api/v1/entity/${o.id}`;
}

/// Best-effort address string out of owprov's shape (a `location`/`locations`
/// object with address lines, or a plain `address` string).
function deriveAddress(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const obj = raw as Record<string, unknown>;
  if (typeof obj.address === "string") return obj.address;
  const loc = (obj.location ??
    (Array.isArray(obj.locations) ? obj.locations[0] : undefined)) as
    | Record<string, unknown>
    | undefined;
  if (loc && typeof loc === "object") {
    const lines = Array.isArray(loc.addressLines) ? (loc.addressLines as string[]) : [];
    return [...lines, loc.city, loc.state, loc.postal, loc.country]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join(", ");
  }
  return "";
}

/// Load the current selection's name + address. Falls back to the cached name
/// when owprov is unreachable so the form still renders.
export async function fetchOrgSettings(o: OrgOption): Promise<OrgSettings> {
  try {
    const raw = await provisioningApi<Record<string, unknown>>(objectPath(o));
    const name = typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : o.name;
    return { name, address: deriveAddress(raw) };
  } catch {
    return { name: o.name, address: "" };
  }
}

/// Persist name + address back to owprov. (owprov's exact address schema is
/// deployment-specific; `name` is a first-class field, `address` is sent
/// alongside and refined once the location model is wired.)
export async function saveOrgSettings(o: OrgOption, s: OrgSettings): Promise<void> {
  await provisioningApi(objectPath(o), {
    method: "PUT",
    body: JSON.stringify({ name: s.name, address: s.address }),
  });
}
