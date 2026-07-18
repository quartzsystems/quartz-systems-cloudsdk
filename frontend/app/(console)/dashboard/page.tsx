"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useState } from "react";
import { AlertOctagon, Wifi, Cpu, Smartphone } from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { fetchOrgTree, findNode } from "@/lib/organizations";
import { DashboardData, loadDashboard } from "@/lib/dashboard";
import { DailyPoint, Metric, readHistory, recordSnapshot } from "@/lib/history";
import { StatTile } from "@/components/dashboard/StatTile";
import { AlarmsTable } from "@/components/dashboard/AlarmsTable";
import { TrendChart, TrendPoint } from "@/components/dashboard/TrendChart";

const RANGES = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 14 Days", days: 14 },
  { label: "Last 30 Days", days: 30 },
];

/// Dashboard for the currently-selected Organization: KPI row, the Site-Alarms
/// table, and Historical Trends. Live figures come from owprov (venues) + owgw
/// (device state); the trend series are the values the console has observed over
/// time (see lib/history).
export default function DashboardPage() {
  const { current } = useOrganization();
  const [data, setData] = useState<DashboardData | null>(null);
  const [history, setHistory] = useState<DailyPoint[]>([]);
  const [days, setDays] = useState(7);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");

  const orgId = current?.id;

  useEffect(() => {
    if (!current) {
      setState("idle");
      setData(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then(async (tree) => {
        const node = findNode(tree, current.id, current.kind);
        const d = node
          ? await loadDashboard(node)
          : { kpis: emptyKpis(), venues: [] };
        if (cancelled) return;
        setData(d);
        // Record today's snapshot only when we actually observed infrastructure,
        // so an unreachable gateway doesn't write zeros over the real trend.
        const observed = d.kpis.infraTotal > 0;
        setHistory(
          observed
            ? recordSnapshot(current.id, {
                alarmVenues: d.kpis.alarmVenues,
                infraOnline: d.kpis.infraOnline,
                throughputMbps: 0, // no analytics feed yet — charted as unavailable
                clients: d.kpis.clients,
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
    const window = orgId ? readHistory(orgId, days) : history.slice(-days);
    const pick = (m: Metric): TrendPoint[] =>
      window.map((p) => ({ label: fmtDay(p.day), value: p[m] }));
    return {
      alarms: pick("alarmVenues"),
      infra: pick("infraOnline"),
      clients: pick("clients"),
    };
  }, [orgId, days, history]);

  const kpis = data?.kpis ?? emptyKpis();

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Dashboard
        </h1>
        {current && (
          <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}: {current.name}
          </span>
        )}
      </div>

      {!current ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
          Select an organization to view its dashboard.
        </p>
      ) : state === "error" ? (
        <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
          Could not reach the provisioning service.
        </p>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatTile
              icon={AlertOctagon}
              label="Active Alarms"
              value={kpis.alarmVenues}
              total={kpis.venueTotal}
              tone="danger"
            />
            <StatTile
              icon={Wifi}
              label="Online Infrastructure"
              value={kpis.infraOnline}
              total={kpis.infraTotal}
              tone="accent"
            />
            <StatTile
              icon={Cpu}
              label="Firmware Failed"
              value={kpis.firmwareFailed}
              total={kpis.firmwareTotal}
              tone="warn"
            />
            <StatTile
              icon={Smartphone}
              label="Wireless Clients"
              value={kpis.clients}
              tone="info"
            />
          </div>

          {/* Site-Alarms */}
          <div className="mb-6">
            {state === "loading" ? (
              <div className="surface p-8 grid place-items-center">
                <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading venues…</p>
              </div>
            ) : (
              <AlarmsTable venues={data?.venues ?? []} />
            )}
          </div>

          {/* Historical Trends */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">
              Historical Trends
            </h2>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-md px-3 py-[6px] text-[12px] text-[var(--qz-fg-1)] outline-none cursor-pointer"
              style={{ background: "var(--qz-input-bg)", border: "1px solid var(--qz-border)" }}
            >
              {RANGES.map((r) => (
                <option key={r.days} value={r.days}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <TrendChart title="Venues with Active Alarms" data={series.alarms} color="var(--qz-warn)" />
            <TrendChart title="Online Infrastructure" data={series.infra} color="var(--qz-accent)" />
            <TrendChart title="Network Throughput" data={[]} color="var(--qz-info)" unit=" Mbps" />
            <TrendChart title="Connected Wireless Clients" data={series.clients} color="#8b7bf0" />
          </div>
        </>
      )}
    </div>
  );
}

function emptyKpis() {
  return {
    alarmVenues: 0,
    venueTotal: 0,
    infraOnline: 0,
    infraTotal: 0,
    firmwareFailed: 0,
    firmwareTotal: 0,
    clients: 0,
  };
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
