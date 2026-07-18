"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Network,
  Search,
} from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { fetchOrgTree, findNode } from "@/lib/organizations";
import { loadVenueBoard, VenueBoard, VenueOrgGroup, VenueStat } from "@/lib/venues";
import { formatBytes, formatDuration } from "@/lib/devices";
import { DailyPoint, Metric, readHistory, recordSnapshot } from "@/lib/history";
import { TrendChart, TrendPoint } from "@/components/dashboard/TrendChart";

const EMPTY_BOARD: VenueBoard = {
  groups: [],
  alarmVenues: 0,
  venueTotal: 0,
  clients: 0,
  infraOnline: 0,
  infraTotal: 0,
};

/// Venues within the currently-scoped Organization: two live trend charts over
/// the venue estate, then every Organization (the current one and its
/// sub-organizations) as a heading with its venues and per-venue infrastructure
/// telemetry. Sourced from owprov (venues) + owgw (live device state).
export default function VenuesPage() {
  const { current } = useOrganization();
  const [board, setBoard] = useState<VenueBoard>(EMPTY_BOARD);
  const [history, setHistory] = useState<DailyPoint[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [query, setQuery] = useState("");

  const orgId = current?.id;

  useEffect(() => {
    if (!current) {
      setState("idle");
      setBoard(EMPTY_BOARD);
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then(async (tree) => {
        const node = findNode(tree, current.id, current.kind);
        const b = node ? await loadVenueBoard(node) : EMPTY_BOARD;
        if (cancelled) return;
        setBoard(b);
        // Record today's snapshot only when infrastructure was actually
        // observed, so an unreachable gateway doesn't write zeros over the trend.
        setHistory(
          b.infraTotal > 0
            ? recordSnapshot(current.id, {
                alarmVenues: b.alarmVenues,
                infraOnline: b.infraOnline,
                throughputMbps: 0,
                clients: b.clients,
              })
            : readHistory(current.id, 90),
        );
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => {
    const window = orgId ? readHistory(orgId, 14) : history.slice(-14);
    const pick = (m: Metric): TrendPoint[] =>
      window.map((p) => ({ label: fmtDay(p.day), value: p[m] }));
    return { alarms: pick("alarmVenues"), clients: pick("clients") };
  }, [orgId, history]);

  // Filter venues within each group by the query; drop groups left empty.
  const filtered = useMemo(() => {
    if (!query) return board.groups;
    const q = query.toLowerCase();
    return board.groups
      .map((g) => ({ ...g, venues: g.venues.filter((v) => v.name.toLowerCase().includes(q)) }))
      .filter((g) => g.venues.length > 0 || g.org.name.toLowerCase().includes(q));
  }, [board.groups, query]);

  const shownVenues = useMemo(
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
      ) : state === "error" ? (
        <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
          Could not reach the provisioning service.
        </p>
      ) : (
        <>
          {/* Two trend charts over the venue estate */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <TrendChart
              title="Venues with Active Alarms"
              data={series.alarms}
              color="var(--qz-warn)"
            />
            <TrendChart
              title="Connected Wireless Clients"
              data={series.clients}
              color="#8b7bf0"
            />
          </div>

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
              {shownVenues} {shownVenues === 1 ? "venue" : "venues"} · {filtered.length}{" "}
              {filtered.length === 1 ? "organization" : "organizations"}
            </span>
          </div>

          {state === "loading" ? (
            <div className="surface p-8 grid place-items-center">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading venues…</p>
            </div>
          ) : filtered.length === 0 ? (
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
function OrgVenues({ group }: { group: VenueOrgGroup }) {
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
                  <th>Name</th>
                  <th>State</th>
                  <th>Infrastructure</th>
                  <th>Traffic</th>
                  <th>Clients</th>
                  <th>Release</th>
                  <th>Peak Temp</th>
                  <th>Avg Uptime</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((v) => (
                  <VenueRow key={v.id} v={v} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function VenueRow({ v }: { v: VenueStat }) {
  const offline = v.infraTotal - v.infraOnline;
  return (
    <tr>
      <td>
        <div className="flex flex-col">
          <span className="text-[var(--qz-fg-1)]">{v.name}</span>
          {offline > 0 && (
            <span className="text-[11px] text-[var(--qz-fg-4)]">
              {offline}/{v.infraTotal} offline
            </span>
          )}
        </div>
      </td>
      <td>
        <StateBadge v={v} />
      </td>
      <td>
        <span
          className="font-mono text-[12px]"
          style={{ color: offline > 0 ? "var(--qz-warn)" : "var(--qz-fg-2)" }}
        >
          {v.infraOnline}
          <span className="text-[var(--qz-fg-4)]">/{v.infraTotal}</span>
        </span>
      </td>
      <td className="text-[12px] text-[var(--qz-fg-3)] whitespace-nowrap">
        {v.txBytes > 0 || v.rxBytes > 0 ? (
          <span className="font-mono">
            ↓{formatBytes(v.rxBytes)} ↑{formatBytes(v.txBytes)}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="mono">{v.clients}</td>
      <td className="text-[12px] text-[var(--qz-fg-2)]">
        {v.firmware ? <span className="badge badge-muted">{v.firmware}</span> : "—"}
      </td>
      <td className="mono text-[12px]">
        {v.peakTempC !== undefined ? `${Math.round(v.peakTempC)}°C` : "—"}
      </td>
      <td className="text-[12px] text-[var(--qz-fg-3)]">
        {v.avgUptimeSeconds !== undefined
          ? formatDuration(Math.floor(Date.now() / 1000) - v.avgUptimeSeconds)
          : "—"}
      </td>
    </tr>
  );
}

function StateBadge({ v }: { v: VenueStat }) {
  if (v.infraTotal === 0) {
    return <span className="text-[12px] text-[var(--qz-fg-4)]">No devices</span>;
  }
  if (v.critical) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--qz-danger)" }}>
        <AlertOctagon size={14} /> Critical
      </span>
    );
  }
  if (v.major) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--qz-warn)" }}>
        <AlertTriangle size={14} /> Degraded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--qz-success)" }}>
      <CheckCircle2 size={14} /> Healthy
    </span>
  );
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
