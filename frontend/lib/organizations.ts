// Data layer for the Organization switcher. In CloudSDK, "Organizations" are
// owprov **entities** and "Venues" are owprov **venues**; both are reached
// through the authenticated /api/owprov/* proxy.

import { provisioningApi } from "@/lib/api";

export type OrgKind = "organization" | "venue";

export interface OrgOption {
  id: string;
  name: string;
  kind: OrgKind;
  /** Parent entity/venue id, when the API reports one (for future nesting). */
  parent?: string;
}

/** owprov objects carry more fields; we only need id/name/parent here. */
interface OwprovObject {
  id?: string;
  name?: string;
  parent?: string;
  entity?: string;
}

/// owprov list endpoints wrap results under a key (`entities` / `venues`) but
/// some return a bare array — accept both, and any single-object shape.
function extractList(raw: unknown, key: string): OwprovObject[] {
  if (Array.isArray(raw)) return raw as OwprovObject[];
  if (raw && typeof raw === "object") {
    const val = (raw as Record<string, unknown>)[key];
    if (Array.isArray(val)) return val as OwprovObject[];
  }
  return [];
}

function toOptions(objs: OwprovObject[], kind: OrgKind): OrgOption[] {
  return objs
    .filter((o) => o.id)
    .map((o) => ({
      id: o.id as string,
      name: o.name?.trim() || (o.id as string),
      kind,
      parent: o.parent ?? o.entity,
    }));
}

export async function fetchOrganizations(): Promise<OrgOption[]> {
  const raw = await provisioningApi<unknown>("/api/v1/entity");
  return toOptions(extractList(raw, "entities"), "organization");
}

export async function fetchVenues(): Promise<OrgOption[]> {
  const raw = await provisioningApi<unknown>("/api/v1/venue");
  return toOptions(extractList(raw, "venues"), "venue");
}

/// Fetch Organizations and Venues together. Either list failing (e.g. one
/// service not reachable yet) doesn't sink the other.
export async function fetchOrgsAndVenues(): Promise<{
  organizations: OrgOption[];
  venues: OrgOption[];
}> {
  const [orgs, venues] = await Promise.allSettled([
    fetchOrganizations(),
    fetchVenues(),
  ]);
  return {
    organizations: orgs.status === "fulfilled" ? orgs.value : [],
    venues: venues.status === "fulfilled" ? venues.value : [],
  };
}
