"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useState } from "react";
import { Plus, RadioTower, Router, Search, Wifi } from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { fetchOrgTree, findNode } from "@/lib/organizations";
import {
  EMPTY_PROFILE_BOARD,
  loadProfiles,
  Profile,
  ProfileBoard,
  ProfileType,
  PROFILE_TYPE_LABEL,
} from "@/lib/profiles";

type Tab = "all" | ProfileType;

const TYPE_ICON: Record<ProfileType, typeof Wifi> = {
  ap: Wifi,
  rf: RadioTower,
  switch: Router,
};
const TYPE_TONE: Record<ProfileType, string> = {
  ap: "var(--qz-accent)",
  rf: "#8b7bf0",
  switch: "var(--qz-info)",
};

/// Configuration profiles (owprov configurations) for the current Organization,
/// classified by type with All / RF / Access Point / Switch filters. Sourced
/// from owprov; see lib/profiles for the (deployment-specific) field handling.
export default function ProfilesPage() {
  const { current } = useOrganization();
  const [board, setBoard] = useState<ProfileBoard>(EMPTY_PROFILE_BOARD);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    if (!current) {
      setState("idle");
      setBoard(EMPTY_PROFILE_BOARD);
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then(async (tree) => {
        const node = findNode(tree, current.id, current.kind);
        const b = node ? await loadProfiles(node) : EMPTY_PROFILE_BOARD;
        if (cancelled) return;
        setBoard(b);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      board.profiles.filter((p) => {
        if (tab !== "all" && p.type !== tab) return false;
        if (!q) return true;
        return [p.name, p.description, p.orgName, ...p.venueNames, PROFILE_TYPE_LABEL[p.type]]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      }),
    [board.profiles, tab, q],
  );

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: "All", count: board.total },
    { id: "rf", label: "RF", count: board.counts.rf },
    { id: "ap", label: "Access Point", count: board.counts.ap },
    { id: "switch", label: "Switch", count: board.counts.switch },
  ];

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Profiles
        </h1>
        {current && (
          <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}: {current.name}
          </span>
        )}
      </div>

      {!current ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
          Select an organization to view its profiles.
        </p>
      ) : state === "error" ? (
        <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
          Could not reach the provisioning service.
        </p>
      ) : (
        <div className="surface overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-3 flex-wrap border-b border-[var(--qz-border)]">
            <div className="flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[6px] w-[240px]">
              <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search profiles…"
                className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
              />
            </div>

            <div className="flex items-center gap-1">
              {tabs.map((t) => {
                const on = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={[
                      "inline-flex items-center gap-1.5 px-3 py-[6px] rounded-md text-[12px] font-medium cursor-pointer border transition-colors",
                      on
                        ? "bg-[var(--qz-accent-soft)] text-[var(--qz-accent)] border-[var(--qz-accent-border)]"
                        : "bg-transparent text-[var(--qz-fg-3)] border-transparent hover:text-[var(--qz-fg-1)]",
                    ].join(" ")}
                  >
                    {t.label}
                    <span className="font-mono text-[11px] text-[var(--qz-fg-4)]">({t.count})</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium rounded-md px-[12px] py-[7px] cursor-not-allowed opacity-60"
              style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
              title="Profile creation is not wired up yet"
              disabled
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {state === "loading" ? (
            <div className="p-8 grid place-items-center">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading profiles…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 grid place-items-center">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
                {board.total === 0
                  ? "No configuration profiles in this organization."
                  : "No profiles match this filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="qz-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Used By</th>
                    <th>Organization</th>
                    <th>Venues</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <ProfileRow key={p.id} p={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileRow({ p }: { p: Profile }) {
  const TypeIcon = TYPE_ICON[p.type];
  const tone = TYPE_TONE[p.type];
  return (
    <tr>
      <td>
        <span
          className="badge"
          style={{
            color: tone,
            borderColor: `color-mix(in oklab, ${tone} 38%, transparent)`,
            background: `color-mix(in oklab, ${tone} 12%, transparent)`,
          }}
        >
          <TypeIcon size={11} /> {PROFILE_TYPE_LABEL[p.type]}
        </span>
      </td>
      <td>
        <span className="inline-flex items-center gap-2">
          <span className="text-[var(--qz-accent)] font-medium">{p.name}</span>
          {p.isDefault && <span className="badge badge-muted">default</span>}
        </span>
      </td>
      <td className="text-[13px] text-[var(--qz-fg-3)]">{p.description || "—"}</td>
      <td className="mono text-[12px]">{p.usedBy}</td>
      <td className="text-[13px] text-[var(--qz-fg-2)]">{p.orgName || "—"}</td>
      <td className="text-[13px] text-[var(--qz-fg-2)]">
        {p.venueNames.length ? p.venueNames.join(", ") : "—"}
      </td>
    </tr>
  );
}
