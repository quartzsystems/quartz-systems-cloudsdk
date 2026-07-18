"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  RefreshCw,
  Router,
  Search,
} from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { fetchOrgTree, findNode } from "@/lib/organizations";
import {
  loadNotifications,
  Notification,
  NotificationBoard,
  timeAgo,
} from "@/lib/notifications";

type Tab = "actionable" | "historical";

/// Notifications for the current Organization: alarms derived from live owgw
/// device connectivity (see lib/notifications), split into Actionable (active)
/// and Historical (cleared), searchable across every column.
export default function NotificationsPage() {
  const { current } = useOrganization();
  const [board, setBoard] = useState<NotificationBoard>({ actionable: [], historical: [] });
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [tab, setTab] = useState<Tab>("actionable");
  const [query, setQuery] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!current) {
      setState("idle");
      setBoard({ actionable: [], historical: [] });
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then(async (tree) => {
        const node = findNode(tree, current.id, current.kind);
        const b = node
          ? await loadNotifications(node, current.id)
          : { actionable: [], historical: [] };
        if (cancelled) return;
        setBoard(b);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const list = tab === "actionable" ? board.actionable : board.historical;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) =>
      [n.summary, n.affects, n.venueName, n.orgName, n.severity, n.ref]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [board, tab, query]);

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Notifications
        </h1>
        {current && (
          <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}: {current.name}
          </span>
        )}
      </div>

      {!current ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
          Select an organization to view its notifications.
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
                placeholder="Search notifications…"
                className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
              />
            </div>

            <div className="flex items-center gap-1">
              {(
                [
                  { id: "actionable", label: `Actionable (${board.actionable.length})` },
                  { id: "historical", label: `Historical (${board.historical.length})` },
                ] as { id: Tab; label: string }[]
              ).map((t) => {
                const on = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={[
                      "px-3 py-[6px] rounded-md text-[12px] font-medium cursor-pointer border transition-colors",
                      on
                        ? "bg-[var(--qz-accent-soft)] text-[var(--qz-accent)] border-[var(--qz-accent-border)]"
                        : "bg-transparent text-[var(--qz-fg-3)] border-transparent hover:text-[var(--qz-fg-1)]",
                    ].join(" ")}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              aria-label="Refresh"
              title="Refresh"
              className="ml-auto grid place-items-center w-8 h-8 rounded-md border border-[var(--qz-border)] bg-[var(--qz-input-bg)] text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] cursor-pointer"
            >
              <RefreshCw size={14} className={state === "loading" ? "animate-spin" : ""} />
            </button>
          </div>

          {state === "loading" ? (
            <div className="p-8 grid place-items-center">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading notifications…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 grid place-items-center">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
                {tab === "actionable"
                  ? board.actionable.length === 0
                    ? "No active notifications in this organization."
                    : "No notifications match your search."
                  : board.historical.length === 0
                    ? "No cleared notifications yet — they appear here as alarms resolve."
                    : "No notifications match your search."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="qz-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>ID</th>
                    <th>Severity</th>
                    <th>Summary</th>
                    <th>Affects</th>
                    <th>Venue</th>
                    <th>Organization</th>
                    <th>{tab === "historical" ? "Cleared" : "Created"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((n) => (
                    <NotificationRow key={n.id} n={n} showCleared={tab === "historical"} />
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

function NotificationRow({ n, showCleared }: { n: Notification; showCleared: boolean }) {
  const SevIcon = n.severity === "critical" ? AlertOctagon : AlertTriangle;
  const sevColor = n.severity === "critical" ? "var(--qz-danger)" : "var(--qz-warn)";
  const AffectsIcon = n.affectsKind === "venue" ? Building2 : Router;
  return (
    <tr>
      <td>
        <span className="inline-flex items-center gap-1.5" style={{ color: sevColor }}>
          <SevIcon size={15} />
        </span>
      </td>
      <td className="mono text-[12px] text-[var(--qz-fg-3)]" title={n.ref}>
        {n.ref}
      </td>
      <td>
        <span
          className="text-[12px] font-semibold capitalize"
          style={{ color: sevColor }}
        >
          {n.severity}
        </span>
      </td>
      <td className="max-w-[360px]">
        <span className="text-[var(--qz-fg-1)]">{n.summary}</span>
      </td>
      <td>
        <span className="inline-flex items-center gap-1.5 text-[var(--qz-fg-2)]">
          <AffectsIcon size={14} className="text-[var(--qz-fg-4)]" />
          {n.affects}
        </span>
      </td>
      <td>{n.venueName}</td>
      <td>{n.orgName}</td>
      <td className="text-[var(--qz-fg-3)]">
        {timeAgo(showCleared ? n.clearedAt : n.createdAt)}
      </td>
    </tr>
  );
}
