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
        <>
          {/* Toolbar: search · tabs · add */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[7px] w-[240px]">
                <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search profiles…"
                  className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
                />
              </div>
              <div className="flex items-center gap-1 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md p-[3px]">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={[
                      "text-[12.5px] font-medium rounded-[5px] px-[12px] py-[5px] cursor-pointer transition-colors whitespace-nowrap",
                      tab === t.id
                        ? "bg-[var(--qz-surface-raised)] text-[var(--qz-fg-1)]"
                        : "text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-2)]",
                    ].join(" ")}
                  >
                    {t.label}{" "}
                    <span className="font-mono text-[11px] text-[var(--qz-fg-4)]">({t.count})</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium rounded-md px-[12px] py-[8px] cursor-not-allowed opacity-60"
              style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
              title="Profile creation is not wired up yet"
              disabled
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {state === "loading" ? (
            <div className="surface p-8 grid place-items-center">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading profiles…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="surface p-6">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
                {board.total === 0
                  ? "No configuration profiles in this organization."
                  : "No profiles match this filter."}
              </p>
            </div>
          ) : (
            <div className="surface overflow-hidden">
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
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProfileRow({ p }: { p: Profile }) {
  const TypeIcon = TYPE_ICON[p.type];
  return (
    <tr>
      <td>
        <span className="inline-flex items-center gap-2 text-[var(--qz-fg-2)]">
          <TypeIcon size={15} className="text-[var(--qz-fg-4)]" />
          {PROFILE_TYPE_LABEL[p.type]}
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
