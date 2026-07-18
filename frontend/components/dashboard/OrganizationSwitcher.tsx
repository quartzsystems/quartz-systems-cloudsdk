"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Network, ChevronsUpDown, ChevronRight, ChevronDown, Search, Check } from "lucide-react";
import { collectIds, fetchOrgTree, filterTree, OrgNode, OrgOption } from "@/lib/organizations";
import { useOrganization } from "@/lib/OrganizationContext";

/// Button + dropdown that sits where the search bar was: shows the Organization
/// (or Venue) the console is scoped to, and presents the full CloudSDK (owprov)
/// hierarchy — top-level entity → sub-entities → venues — as an expandable tree.
export function OrganizationSwitcher() {
  const { current, setCurrent } = useOrganization();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const ref = useRef<HTMLDivElement>(null);

  // Load the hierarchy the first time the dropdown is opened (refresh on reopen).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then((nodes) => {
        if (cancelled) return;
        setTree(nodes);
        setExpanded(new Set(collectIds(nodes))); // default fully expanded
        setState("idle");
        // Default the scope to the first top-level Organization if none is set.
        if (!current && nodes[0]) setCurrent({ id: nodes[0].id, name: nodes[0].name, kind: nodes[0].kind });
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // While searching, prune to matches and force every surviving node open.
  const visible = useMemo(() => (query ? filterTree(tree, query) : tree), [tree, query]);
  const forceOpen = query.length > 0;
  const empty = visible.length === 0;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const pick = (node: OrgNode) => {
    setCurrent({ id: node.id, name: node.name, kind: node.kind } as OrgOption);
    setOpen(false);
    setQuery("");
  };

  const CurrentIcon = current?.kind === "venue" ? Building2 : Network;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[7px] cursor-pointer hover:border-[var(--qz-border-strong)] transition-colors text-left"
      >
        <CurrentIcon size={14} className="text-[var(--qz-accent)] flex-shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--qz-fg-4)] leading-none font-mono">
            Organization
          </span>
          <span className="text-[13px] text-[var(--qz-fg-1)] font-medium truncate leading-tight mt-[2px]">
            {current ? current.name : "Select…"}
          </span>
        </div>
        <ChevronsUpDown size={14} className="text-[var(--qz-fg-4)] flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 right-0 mt-2 z-40 rounded-lg overflow-hidden"
          style={{
            background: "var(--qz-surface-raised)",
            border: "1px solid var(--qz-border)",
            boxShadow: "var(--qz-shadow-2)",
          }}
        >
          {/* Search within the hierarchy */}
          <div className="flex items-center gap-2 px-[10px] py-2 border-b border-[var(--qz-border)]">
            <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for an entity or venue…"
              className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
            />
          </div>

          <div className="max-h-[360px] overflow-auto py-1">
            {state === "loading" && (
              <p className="px-3 py-3 text-[12px] text-[var(--qz-fg-4)] m-0">Loading…</p>
            )}
            {state === "error" && (
              <p className="px-3 py-3 text-[12px] m-0" style={{ color: "var(--qz-danger)" }}>
                Could not reach the provisioning service.
              </p>
            )}
            {state === "idle" && empty && (
              <p className="px-3 py-3 text-[12px] text-[var(--qz-fg-4)] m-0">
                No organizations or venues found.
              </p>
            )}
            {state === "idle" &&
              visible.map((node) => (
                <TreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  forceOpen={forceOpen}
                  currentId={current?.id}
                  currentKind={current?.kind}
                  onToggle={toggle}
                  onSelect={pick}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  forceOpen,
  currentId,
  currentKind,
  onToggle,
  onSelect,
}: {
  node: OrgNode;
  depth: number;
  expanded: Set<string>;
  forceOpen: boolean;
  currentId?: string;
  currentKind?: string;
  onToggle: (id: string) => void;
  onSelect: (n: OrgNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = forceOpen || expanded.has(node.id);
  const selected = currentId === node.id && currentKind === node.kind;
  const Icon = node.kind === "venue" ? Building2 : Network;

  return (
    <>
      <div
        className={[
          "flex items-center gap-1 pr-2 py-[6px] rounded-md cursor-pointer text-[13px] transition-colors",
          selected
            ? "bg-[var(--qz-accent-soft)] text-[var(--qz-accent)]"
            : "text-[var(--qz-fg-2)] hover:bg-[color-mix(in_oklab,white_4%,transparent)] hover:text-[var(--qz-fg-1)]",
        ].join(" ")}
        style={{ paddingLeft: 6 + depth * 16 }}
        onClick={() => onSelect(node)}
      >
        {/* Expand / collapse control (or spacer for leaves) */}
        {hasChildren ? (
          <button
            type="button"
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="w-4 h-4 grid place-items-center flex-shrink-0 text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] bg-transparent border-0 p-0 cursor-pointer"
          >
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        <Icon
          size={14}
          className={`flex-shrink-0 ${selected ? "text-[var(--qz-accent)]" : "text-[var(--qz-fg-4)]"}`}
        />
        <span className="flex-1 truncate">{node.name}</span>
        {selected && <Check size={14} className="text-[var(--qz-accent)] flex-shrink-0" />}
      </div>

      {hasChildren &&
        isOpen &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            forceOpen={forceOpen}
            currentId={currentId}
            currentKind={currentKind}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}
