"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useState } from "react";
import { Building2, Network, MapPin, Search } from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { fetchOrgTree, findNode, groupVenuesByOrg, VenueGroup } from "@/lib/organizations";

/// Venues within the currently-scoped Organization, grouped by the Organization
/// they belong to: each Organization (the current one and its sub-organizations)
/// is a heading with its venues listed beneath. Sourced from the CloudSDK
/// provisioning service (owprov); switching the Organization re-scopes the list.
export default function VenuesPage() {
  const { current } = useOrganization();
  const [groups, setGroups] = useState<VenueGroup[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!current) {
      setState("idle");
      setGroups([]);
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then((tree) => {
        if (cancelled) return;
        const node = findNode(tree, current.id, current.kind);
        setGroups(node ? groupVenuesByOrg(node) : []);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter venues within each group by the query; drop groups left empty.
  const filtered = useMemo(() => {
    if (!query) return groups;
    const q = query.toLowerCase();
    return groups
      .map((g) => ({ ...g, venues: g.venues.filter((v) => v.name.toLowerCase().includes(q)) }))
      .filter((g) => g.venues.length > 0 || g.org.name.toLowerCase().includes(q));
  }, [groups, query]);

  const totalVenues = useMemo(
    () => filtered.reduce((n, g) => n + g.venues.length, 0),
    [filtered],
  );

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Venues
        </h1>
        {current && (
          <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}: {current.name}
          </span>
        )}
      </div>

      {!current ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
          Select an organization to view its venues.
        </p>
      ) : state === "loading" ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading venues…</p>
      ) : state === "error" ? (
        <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
          Could not reach the provisioning service.
        </p>
      ) : (
        <>
          {/* Search + count */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[7px] w-[280px]">
              <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search venues…"
                className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
              />
            </div>
            <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
              {totalVenues} {totalVenues === 1 ? "venue" : "venues"} ·{" "}
              {filtered.length} {filtered.length === 1 ? "organization" : "organizations"}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="surface p-6">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
                No venues in this organization yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {filtered.map((g) => (
                <OrgVenues key={`${g.org.kind}:${g.org.id}`} group={g} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/// One Organization heading with the venues that belong to it.
function OrgVenues({ group }: { group: VenueGroup }) {
  const { org, venues } = group;
  const HeadingIcon = org.kind === "venue" ? Building2 : Network;
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <HeadingIcon size={15} className="text-[var(--qz-accent)]" />
        <h2 className="text-[14px] font-semibold text-[var(--qz-fg-1)] m-0">{org.name}</h2>
        <span className="text-[11px] text-[var(--qz-fg-4)] font-mono">
          {venues.length} {venues.length === 1 ? "venue" : "venues"}
        </span>
      </div>

      {venues.length === 0 ? (
        <div className="surface p-4">
          <p className="text-[12px] text-[var(--qz-fg-4)] m-0">No venues in this organization.</p>
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="qz-table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Sub-venues</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <MapPin size={14} className="text-[var(--qz-fg-4)]" />
                        {v.name}
                      </span>
                    </td>
                    <td>{v.children.filter((c) => c.kind === "venue").length || "—"}</td>
                    <td className="mono">{v.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
