"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Network,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import {
  createOrganization,
  fetchOrgTree,
  findNode,
  OrgOption,
} from "@/lib/organizations";
import { EMPTY_ORG_BOARD, loadOrgBoard, OrgBoard, OrgStat } from "@/lib/orgboard";
import { formatBytes } from "@/lib/devices";
import { DailyPoint, readHistory, recordSnapshot } from "@/lib/history";

type Tab = "all" | "issues" | "offline";

/// The organizations under the currently-scoped Organization, as a table with
/// live owgw device state: infrastructure online/total, venues up, connected
/// clients, and traffic. Filter tabs (All / Issues / Offline), search, and an
/// Add control to provision a new Organization. Sourced from owprov (the
/// Organization tree) + owgw (live device state).
export default function OrganizationsPage() {
  const { current, setCurrent } = useOrganization();
  const [board, setBoard] = useState<OrgBoard>(EMPTY_ORG_BOARD);
  const [history, setHistory] = useState<Map<string, DailyPoint[]>>(new Map());
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [adding, setAdding] = useState(false);

  const reload = useMemo(
    () => () => {
      if (!current) {
        setState("idle");
        setBoard(EMPTY_ORG_BOARD);
        return () => {};
      }
      let cancelled = false;
      setState("loading");
      fetchOrgTree()
        .then(async (tree) => {
          const node = findNode(tree, current.id, current.kind);
          const b = node ? await loadOrgBoard(node) : EMPTY_ORG_BOARD;
          if (cancelled) return;
          setBoard(b);
          // Record today's clients per org (only when infra was observed) so the
          // sparklines fill in honestly over time, and read back the trailing
          // window for each.
          const hist = new Map<string, DailyPoint[]>();
          for (const o of b.orgs) {
            hist.set(
              o.id,
              o.infraTotal > 0
                ? recordSnapshot(o.id, {
                    alarmVenues: o.critical || o.major ? 1 : 0,
                    infraOnline: o.infraOnline,
                    throughputMbps: 0,
                    clients: o.clients,
                  }).slice(-14)
                : readHistory(o.id, 14),
            );
          }
          setHistory(hist);
          setState("idle");
        })
        .catch(() => !cancelled && setState("error"));
      return () => {
        cancelled = true;
      };
    },
    [current?.id, current?.kind], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => reload(), [reload]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    return board.orgs.filter((o) => {
      if (q && !o.name.toLowerCase().includes(q)) return false;
      if (tab === "issues") return o.critical || o.major;
      if (tab === "offline") return o.offline;
      return true;
    });
  }, [board.orgs, q, tab]);

  const drillInto = (o: OrgStat) =>
    setCurrent({ id: o.id, name: o.name, kind: "organization" } as OrgOption);

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
          Select an organization to view its sub-organizations.
        </p>
      ) : state === "error" ? (
        <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
          Could not reach the provisioning service.
        </p>
      ) : (
        <>
          {/* Toolbar: tabs · search · add */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md p-[3px]">
              <TabButton label="All" count={board.total} active={tab === "all"} onClick={() => setTab("all")} />
              <TabButton label="Issues" count={board.issues} active={tab === "issues"} onClick={() => setTab("issues")} />
              <TabButton label="Offline" count={board.offline} active={tab === "offline"} onClick={() => setTab("offline")} />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[7px] w-[240px]">
                <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search organizations…"
                  className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
                />
              </div>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium rounded-md px-[12px] py-[8px] cursor-pointer transition-colors"
                style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {state === "loading" ? (
            <div className="surface p-8 grid place-items-center">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading organizations…</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="surface p-6">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
                {board.total === 0
                  ? "No sub-organizations here yet. Use Add to create one."
                  : "No organizations match this filter."}
              </p>
            </div>
          ) : (
            <div className="surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="qz-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Operations</th>
                      <th>Infrastructure</th>
                      <th>Venues</th>
                      <th>Traffic</th>
                      <th>Clients</th>
                      <th>Country</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((o) => (
                      <OrgRow
                        key={o.id}
                        o={o}
                        history={history.get(o.id) ?? []}
                        onOpen={() => drillInto(o)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {adding && current && (
        <AddOrganizationModal
          parent={current}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-[12.5px] font-medium rounded-[5px] px-[12px] py-[5px] cursor-pointer transition-colors whitespace-nowrap",
        active
          ? "bg-[var(--qz-surface-raised)] text-[var(--qz-fg-1)]"
          : "text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-2)]",
      ].join(" ")}
    >
      {label} <span className="font-mono text-[11px] text-[var(--qz-fg-4)]">({count})</span>
    </button>
  );
}

function OrgRow({
  o,
  history,
  onOpen,
}: {
  o: OrgStat;
  history: DailyPoint[];
  onOpen: () => void;
}) {
  const offline = o.infraTotal - o.infraOnline;
  const StatusIcon = o.critical ? AlertOctagon : o.major ? AlertTriangle : CheckCircle2;
  const statusColor = o.critical
    ? "var(--qz-danger)"
    : o.major
      ? "var(--qz-warn)"
      : "var(--qz-success)";

  return (
    <tr onClick={onOpen}>
      {/* Name + status + inventory subline */}
      <td>
        <div className="flex items-center gap-2.5">
          {o.infraTotal > 0 ? (
            <StatusIcon size={16} style={{ color: statusColor }} className="flex-shrink-0" />
          ) : (
            <Network size={15} className="text-[var(--qz-fg-4)] flex-shrink-0" />
          )}
          <div className="flex flex-col">
            <span className="text-[var(--qz-accent)] font-medium hover:underline">{o.name}</span>
            <span className="text-[11px] text-[var(--qz-fg-4)]">
              {o.infraTotal === 0 ? (
                "No infrastructure"
              ) : (
                <>
                  {o.inventory}
                  {offline > 0 && (
                    <span style={{ color: "var(--qz-warn)" }}> · {offline} offline</span>
                  )}
                </>
              )}
            </span>
          </div>
        </div>
      </td>

      {/* Operations — alarm badge derived from connectivity */}
      <td>
        {o.critical ? (
          <span className="badge badge-crit">
            <AlertOctagon size={11} /> {offline}
          </span>
        ) : o.major ? (
          <span className="badge badge-warn">
            <AlertTriangle size={11} /> {offline}
          </span>
        ) : (
          <span className="text-[var(--qz-fg-4)]">—</span>
        )}
      </td>

      {/* Infrastructure online / total */}
      <td>
        <span
          className="font-mono text-[12px]"
          style={{ color: offline > 0 ? "var(--qz-warn)" : "var(--qz-fg-2)" }}
        >
          {o.infraOnline}
          <span className="text-[var(--qz-fg-4)]">/{o.infraTotal}</span>
        </span>
      </td>

      {/* Venues up / total */}
      <td>
        <span className="font-mono text-[12px] text-[var(--qz-fg-2)]">
          {o.venuesOnline}
          <span className="text-[var(--qz-fg-4)]">/{o.venueTotal}</span>
        </span>
      </td>

      {/* Traffic — live cumulative counters */}
      <td className="text-[12px] text-[var(--qz-fg-3)] whitespace-nowrap">
        {o.txBytes > 0 || o.rxBytes > 0 ? (
          <span className="font-mono">
            ↓{formatBytes(o.rxBytes)} ↑{formatBytes(o.txBytes)}
          </span>
        ) : (
          <span className="text-[var(--qz-fg-4)]">—</span>
        )}
      </td>

      {/* Clients — sparkline over recorded history, else the current value */}
      <td>
        <div className="flex items-center gap-2">
          <Sparkline points={history.map((p) => p.clients)} />
          <span className="font-mono text-[12px] text-[var(--qz-fg-2)]">{o.clients}</span>
        </div>
      </td>

      {/* Country */}
      <td className="text-[12px] text-[var(--qz-fg-3)]">
        {o.country ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>{flagEmoji(o.country)}</span>
            <span className="font-mono">{o.country}</span>
          </span>
        ) : (
          <span className="text-[var(--qz-fg-4)]">—</span>
        )}
      </td>
    </tr>
  );
}

/// Compact inline sparkline (no axes/labels) for the recorded client trend.
/// Renders nothing until there are at least two points to connect.
function Sparkline({ points }: { points: number[] }) {
  const W = 56;
  const H = 18;
  if (points.length < 2) return <span className="inline-block" style={{ width: W, height: H }} />;
  const max = Math.max(1, ...points);
  const step = W / (points.length - 1);
  const line = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - (v / max) * (H - 2) - 1).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block flex-shrink-0" aria-hidden>
      <path
        d={line}
        fill="none"
        stroke="#8b7bf0"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/// Two-letter ISO country code → flag emoji (regional-indicator letters).
function flagEmoji(code: string): string {
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "🏳";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function AddOrganizationModal({
  parent,
  onClose,
  onCreated,
}: {
  parent: OrgOption;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A new Organization nests under the current Organization; nesting under a
  // venue isn't meaningful, so fall back to a top-level entity in that case.
  const parentId = parent.kind === "organization" ? parent.id : "";

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createOrganization(trimmed, parentId);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the organization.");
      setSaving(false);
    }
  };

  return (
    <div
      className="drawer-scrim grid place-items-center"
      onMouseDown={onClose}
    >
      <div
        className="surface w-[420px] max-w-[92vw] p-5"
        style={{ background: "var(--qz-surface-raised)", boxShadow: "var(--qz-shadow-3)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-semibold text-[var(--qz-fg-1)] m-0">Add organization</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] bg-transparent border-0 p-0 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <label className="block text-[11px] font-mono uppercase tracking-[0.08em] text-[var(--qz-fg-4)] mb-1.5">
          Name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Acme Corporation"
          className="w-full bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[8px] text-[13px] text-[var(--qz-fg-1)] outline-none focus:border-[var(--qz-accent-border)] placeholder:text-[var(--qz-fg-4)]"
        />

        <p className="text-[11.5px] text-[var(--qz-fg-4)] mt-2 mb-0">
          {parentId
            ? <>Created under <span className="text-[var(--qz-fg-3)]">{parent.name}</span>.</>
            : "Created as a top-level organization."}
        </p>

        {error && (
          <p className="text-[12px] mt-3 mb-0" style={{ color: "var(--qz-danger)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] rounded-md px-[14px] py-[8px] cursor-pointer border border-[var(--qz-border)] text-[var(--qz-fg-2)] hover:text-[var(--qz-fg-1)] bg-transparent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim() || saving}
            className="text-[13px] font-medium rounded-md px-[14px] py-[8px] cursor-pointer transition-opacity disabled:opacity-50"
            style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
