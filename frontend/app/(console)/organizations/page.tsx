"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useState } from "react";
import { Network, ChevronRight, ChevronDown, MapPin, Search } from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { collectIds, fetchOrgTree, findNode, OrgNode } from "@/lib/organizations";

/// The Organization (entity) hierarchy under the currently-scoped Organization,
/// sourced from the CloudSDK provisioning service (owprov). Switching the
/// Organization in the sidebar re-scopes this tree.
export default function OrganizationsPage() {
  const { current } = useOrganization();
  const [root, setRoot] = useState<OrgNode | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!current) {
      setState("idle");
      setRoot(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then((tree) => {
        if (cancelled) return;
        const node = findNode(tree, current.id, current.kind);
        setRoot(node);
        setExpanded(node ? new Set(collectIds([node])) : new Set());
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Sub-organizations directly under the current scope (the tree body).
  const childOrgs = useMemo(
    () => (root ? root.children.filter((c) => c.kind === "organization") : []),
    [root],
  );
  const matches = (n: OrgNode) => n.name.toLowerCase().includes(query.toLowerCase());

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Organizations
        </h1>
        {current && (
          <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}: {current.name}
          </span>
        )}
      </div>

      {!current ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
          Select an organization to view its hierarchy.
        </p>
      ) : state === "loading" ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading organizations…</p>
      ) : state === "error" ? (
        <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
          Could not reach the provisioning service.
        </p>
      ) : !root ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
          This organization is no longer available. Pick another from the switcher.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[7px] w-[280px]">
              <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search organizations…"
                className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
              />
            </div>
            <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
              {childOrgs.length} {childOrgs.length === 1 ? "sub-organization" : "sub-organizations"}
            </span>
          </div>

          <div className="surface overflow-hidden">
            {/* The scoped Organization itself, as the tree root. */}
            <OrgRow node={root} depth={0} isRoot expanded={expanded} onToggle={toggle} query={query} />
            {childOrgs.length === 0 && (
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0 px-4 py-4">
                No sub-organizations under {root.name}.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );

  function OrgRow({
    node,
    depth,
    isRoot = false,
    expanded,
    onToggle,
    query,
  }: {
    node: OrgNode;
    depth: number;
    isRoot?: boolean;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    query: string;
  }) {
    // Show only organization children in this view (venues live on the Venues page).
    const childOrgs = node.children.filter((c) => c.kind === "organization");
    const venueCount = node.children.filter((c) => c.kind === "venue").length;
    const hasChildren = childOrgs.length > 0;
    const isOpen = query.length > 0 || expanded.has(node.id) || isRoot;
    // While searching, hide branches with no match anywhere in them.
    const visibleChildren = query
      ? childOrgs.filter(function keep(c): boolean {
          return matches(c) || c.children.some((cc) => cc.kind === "organization" && keep(cc));
        })
      : childOrgs;
    if (query && !isRoot && !matches(node) && visibleChildren.length === 0) return null;

    return (
      <>
        <div
          className="flex items-center gap-2 px-3 py-[10px] border-b border-[var(--qz-divider)]"
          style={{ paddingLeft: 12 + depth * 18 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              aria-label={isOpen ? "Collapse" : "Expand"}
              className="w-4 h-4 grid place-items-center flex-shrink-0 text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] bg-transparent border-0 p-0 cursor-pointer"
            >
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="w-4 h-4 flex-shrink-0" />
          )}
          <Network
            size={14}
            className={`flex-shrink-0 ${isRoot ? "text-[var(--qz-accent)]" : "text-[var(--qz-fg-4)]"}`}
          />
          <span className={`flex-1 text-[13px] ${isRoot ? "text-[var(--qz-fg-1)] font-medium" : "text-[var(--qz-fg-2)]"}`}>
            {node.name}
          </span>
          {venueCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--qz-fg-4)] font-mono">
              <MapPin size={11} />
              {venueCount}
            </span>
          )}
          <span className="text-[11px] text-[var(--qz-fg-4)] font-mono mono ml-1">{node.id}</span>
        </div>

        {hasChildren &&
          isOpen &&
          visibleChildren.map((child) => (
            <OrgRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              query={query}
            />
          ))}
      </>
    );
  }
}
