// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Data layer for the Organization switcher. In CloudSDK, "Organizations" are
// owprov **entities** and "Venues" are owprov **venues**; both are reached
// through the authenticated /api/owprov/* proxy.
//
// Entities nest via a `parent` entity id; venues hang off an entity (`entity`)
// and can nest under a parent venue (`parent`). We assemble those pointers into
// a single hierarchy: top-level entity → sub-entities → venues.

import { provisioningApi } from "@/lib/api";

export type OrgKind = "organization" | "venue";

/** A flat selection (what the app scopes to). */
export interface OrgOption {
  id: string;
  name: string;
  kind: OrgKind;
}

/** A node in the hierarchy tree. */
export interface OrgNode extends OrgOption {
  children: OrgNode[];
}

interface OwprovEntity {
  id?: string;
  name?: string;
  parent?: string;
}
interface OwprovVenue {
  id?: string;
  name?: string;
  entity?: string;
  parent?: string;
}

/// owprov list endpoints wrap results under a key (`entities` / `venues`) but
/// some return a bare array — accept both.
function extractList<T>(raw: unknown, key: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const val = (raw as Record<string, unknown>)[key];
    if (Array.isArray(val)) return val as T[];
  }
  return [];
}

const label = (name: string | undefined, id: string) => name?.trim() || id;

/// Assemble entities + venues into a forest. Entities attach to their parent
/// entity; venues attach to their parent venue when present, else to their
/// entity. Anything whose parent is missing becomes a root (covers the owprov
/// root entity, whose parent is empty).
function buildTree(entities: OwprovEntity[], venues: OwprovVenue[]): OrgNode[] {
  const entNodes = new Map<string, OrgNode>();
  for (const e of entities) {
    if (e.id) entNodes.set(e.id, { id: e.id, name: label(e.name, e.id), kind: "organization", children: [] });
  }
  const venNodes = new Map<string, OrgNode>();
  for (const v of venues) {
    if (v.id) venNodes.set(v.id, { id: v.id, name: label(v.name, v.id), kind: "venue", children: [] });
  }

  const roots: OrgNode[] = [];

  // Child entities under their parent entity; parentless entities are roots.
  for (const e of entities) {
    if (!e.id) continue;
    const node = entNodes.get(e.id)!;
    const parent = e.parent ? entNodes.get(e.parent) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Venues under their parent venue if known, else under their entity, else
  // promoted to a root so they're never lost.
  for (const v of venues) {
    if (!v.id) continue;
    const node = venNodes.get(v.id)!;
    const parentVenue = v.parent ? venNodes.get(v.parent) : undefined;
    const entity = v.entity ? entNodes.get(v.entity) : undefined;
    if (parentVenue) parentVenue.children.push(node);
    else if (entity) entity.children.push(node);
    else roots.push(node);
  }

  sortNodes(roots);
  return roots;
}

/// Organizations before venues, then alphabetical; recurse.
function sortNodes(nodes: OrgNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "organization" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) sortNodes(n.children);
}

/// Fetch the full Organization/Venue hierarchy. Either list failing (e.g. one
/// service not reachable yet) doesn't sink the other.
export async function fetchOrgTree(): Promise<OrgNode[]> {
  const [ent, ven] = await Promise.allSettled([
    provisioningApi<unknown>("/api/v1/entity"),
    provisioningApi<unknown>("/api/v1/venue"),
  ]);
  const entities = ent.status === "fulfilled" ? extractList<OwprovEntity>(ent.value, "entities") : [];
  const venues = ven.status === "fulfilled" ? extractList<OwprovVenue>(ven.value, "venues") : [];
  return buildTree(entities, venues);
}

/// Every node id in the tree (used to default-expand the hierarchy).
export function collectIds(nodes: OrgNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    acc.push(n.id);
    collectIds(n.children, acc);
  }
  return acc;
}

/// Depth-first lookup of a node by id + kind.
export function findNode(nodes: OrgNode[], id: string, kind: OrgKind): OrgNode | null {
  for (const n of nodes) {
    if (n.id === id && n.kind === kind) return n;
    const found = findNode(n.children, id, kind);
    if (found) return found;
  }
  return null;
}

/// All venue nodes within `node`'s subtree (includes `node` itself when it is a
/// venue). Used to list every venue under the current Organization.
export function collectVenues(node: OrgNode): OrgNode[] {
  const out: OrgNode[] = [];
  const walk = (n: OrgNode) => {
    if (n.kind === "venue") out.push(n);
    n.children.forEach(walk);
  };
  node.children.forEach(walk);
  if (node.kind === "venue") out.unshift(node);
  return out;
}

/// Prune the tree to nodes matching `query`, keeping ancestors of any match.
export function filterTree(nodes: OrgNode[], query: string): OrgNode[] {
  const q = query.toLowerCase();
  const walk = (n: OrgNode): OrgNode | null => {
    const children = n.children.map(walk).filter(Boolean) as OrgNode[];
    if (n.name.toLowerCase().includes(q) || children.length) return { ...n, children };
    return null;
  };
  return nodes.map(walk).filter(Boolean) as OrgNode[];
}
