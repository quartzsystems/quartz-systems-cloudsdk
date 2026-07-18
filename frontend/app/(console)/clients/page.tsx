"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useState } from "react";
import { Cable, RefreshCw, Search, Wifi } from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { fetchOrgTree, findNode } from "@/lib/organizations";
import { Client, ClientKind, loadClients } from "@/lib/clients";
import { formatDuration } from "@/lib/devices";
import { DailyPoint, Metric, readHistory } from "@/lib/history";
import { TrendChart, TrendPoint } from "@/components/dashboard/TrendChart";

type Filter = "wireless" | "wired" | "all";

/// Clients across the current Organization's connected infrastructure. Wireless
/// clients (SSID associations) and wired clients are read from each device's
/// latest owgw state (see lib/clients); the trend chart reuses the console's
/// recorded client history. Searchable across every column.
export default function ClientsPage() {
  const { current } = useOrganization();
  const [clients, setClients] = useState<Client[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [filter, setFilter] = useState<Filter>("wireless");
  const [query, setQuery] = useState("");
  const [nonce, setNonce] = useState(0);

  const orgId = current?.id;

  useEffect(() => {
    if (!current) {
      setState("idle");
      setClients([]);
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then(async (tree) => {
        const node = findNode(tree, current.id, current.kind);
        const list = node ? await loadClients(node) : [];
        if (cancelled) return;
        setClients(list);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(
    () => ({
      wireless: clients.filter((c) => c.kind === "wireless").length,
      wired: clients.filter((c) => c.kind === "wired").length,
      all: clients.length,
    }),
    [clients],
  );

  const series = useMemo(() => {
    const window: DailyPoint[] = orgId ? readHistory(orgId, 14) : [];
    const pick = (m: Metric): TrendPoint[] =>
      window.map((p) => ({ label: fmtDay(p.day), value: p[m] }));
    return pick("clients");
  }, [orgId, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      const kindOk = filter === "all" || c.kind === filter;
      if (!kindOk) return false;
      if (!q) return true;
      return [c.mac, c.ip, c.network, c.deviceName, c.identity, c.band, c.vlan]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [clients, filter, query]);

  const tabs: { id: Filter; label: string; icon?: typeof Wifi }[] = [
    { id: "wireless", label: `Wireless (${counts.wireless})`, icon: Wifi },
    { id: "wired", label: `Wired (${counts.wired})`, icon: Cable },
    { id: "all", label: `All (${counts.all})` },
  ];

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Clients
        </h1>
        {current && (
          <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}: {current.name}
          </span>
        )}
      </div>

      {!current ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
          Select an organization to view its clients.
        </p>
      ) : state === "error" ? (
        <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
          Could not reach the provisioning service.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <TrendChart
              title="Connected Wireless Clients"
              data={series}
              color="#8b7bf0"
            />
            <div className="hidden lg:block" />
          </div>

          <div className="surface overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-3 flex-wrap border-b border-[var(--qz-border)]">
              <div className="flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[6px] w-[240px]">
                <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients…"
                  className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
                />
              </div>

              <div className="flex items-center gap-1">
                {tabs.map((t) => {
                  const on = filter === t.id;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFilter(t.id)}
                      className={[
                        "inline-flex items-center gap-1.5 px-3 py-[6px] rounded-md text-[12px] font-medium cursor-pointer border transition-colors",
                        on
                          ? "bg-[var(--qz-accent-soft)] text-[var(--qz-accent)] border-[var(--qz-accent-border)]"
                          : "bg-transparent text-[var(--qz-fg-3)] border-transparent hover:text-[var(--qz-fg-1)]",
                      ].join(" ")}
                    >
                      {Icon && <Icon size={13} />}
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
                <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading clients…</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="p-8 grid place-items-center">
                <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
                  {clients.length === 0
                    ? "No connected clients in this organization."
                    : "No clients match this filter."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="qz-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>MAC Address</th>
                      <th>IP Address</th>
                      <th>VLAN</th>
                      <th>Identity</th>
                      <th>Network</th>
                      <th>Infrastructure</th>
                      <th>Connected</th>
                      <th>Band</th>
                      <th>Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <ClientRow key={c.key} c={c} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const BAND_TONE: Record<string, string> = {
  "2G": "var(--qz-info)",
  "5G": "var(--qz-accent)",
  "6G": "#8b7bf0",
};

function ClientRow({ c }: { c: Client }) {
  const KindIcon = c.kind === "wired" ? Cable : Wifi;
  return (
    <tr>
      <td>
        <span className="inline-flex items-center gap-2 text-[var(--qz-fg-2)]">
          <KindIcon size={14} className="text-[var(--qz-fg-4)]" />
          {c.identity || "—"}
        </span>
      </td>
      <td className="mono text-[12px]">{c.mac}</td>
      <td className="mono text-[12px]">{c.ip || "—"}</td>
      <td className="mono text-[12px]">{c.vlan ?? "—"}</td>
      <td>{c.identity || "—"}</td>
      <td>{c.network || "—"}</td>
      <td>{c.deviceName}</td>
      <td className="text-[12px] text-[var(--qz-fg-3)] whitespace-nowrap">
        {c.connectedSeconds !== undefined
          ? formatDuration(Math.floor(Date.now() / 1000) - c.connectedSeconds)
          : "—"}
      </td>
      <td>
        {c.band ? (
          <span
            className="badge"
            style={{
              color: BAND_TONE[c.band] ?? "var(--qz-fg-2)",
              borderColor: `color-mix(in oklab, ${BAND_TONE[c.band] ?? "var(--qz-fg-2)"} 38%, transparent)`,
              background: `color-mix(in oklab, ${BAND_TONE[c.band] ?? "var(--qz-fg-2)"} 12%, transparent)`,
            }}
          >
            {c.band}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="mono text-[12px]">{c.channel ?? "—"}</td>
    </tr>
  );
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
