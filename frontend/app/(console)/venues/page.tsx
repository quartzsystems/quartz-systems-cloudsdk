"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Search } from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { collectVenues, fetchOrgTree, findNode, OrgNode } from "@/lib/organizations";

/// Venues within the currently-scoped Organization, sourced from the CloudSDK
/// provisioning service (owprov). Switching the Organization in the sidebar
/// re-scopes this list.
export default function VenuesPage() {
  const { current } = useOrganization();
  const [venues, setVenues] = useState<OrgNode[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!current) {
      setState("idle");
      setVenues([]);
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then((tree) => {
        if (cancelled) return;
        const node = findNode(tree, current.id, current.kind);
        setVenues(node ? collectVenues(node) : []);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(
    () => (query ? venues.filter((v) => v.name.toLowerCase().includes(query.toLowerCase())) : venues),
    [venues, query],
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
          <div className="flex items-center justify-between mb-3 gap-3">
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
              {filtered.length} {filtered.length === 1 ? "venue" : "venues"}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="surface p-6">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
                No venues in this organization yet.
              </p>
            </div>
          ) : (
            <div className="surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="qz-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Sub-venues</th>
                      <th>ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <span className="inline-flex items-center gap-2">
                            <Building2 size={14} className="text-[var(--qz-fg-4)]" />
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
        </>
      )}
    </div>
  );
}
