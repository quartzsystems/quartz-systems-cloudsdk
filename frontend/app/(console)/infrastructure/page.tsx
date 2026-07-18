"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Router, Search, Server, Wifi, X } from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { collectVenues, fetchOrgTree, findNode, OrgNode } from "@/lib/organizations";
import {
  createInfrastructure,
  EMPTY_INFRA_BOARD,
  fetchDeviceTypes,
  InfraBoard,
  InfraDevice,
  InfraDraft,
  isValidMac,
  loadInfrastructure,
} from "@/lib/infrastructure";
import { DeviceClass, deviceClassLabel, formatBytes, formatDuration } from "@/lib/devices";

type VenueOption = { id: string; name: string };

type Filter = "all" | "online" | "offline";

const CLASS_ICON: Record<DeviceClass, typeof Wifi> = {
  ap: Wifi,
  switch: Server,
  gateway: Router,
};
const CLASS_TONE: Record<DeviceClass, string> = {
  ap: "var(--qz-accent)",
  switch: "var(--qz-info)",
  gateway: "#8b7bf0",
};

/// Access points, switches and gateways owgw manages for the current
/// Organization. Live device state (lib/infrastructure) with status/online
/// filters, search across every column, and a manual refresh.
export default function InfrastructurePage() {
  const { current } = useOrganization();
  const [board, setBoard] = useState<InfraBoard>(EMPTY_INFRA_BOARD);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [nonce, setNonce] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!current) {
      setState("idle");
      setBoard(EMPTY_INFRA_BOARD);
      setVenues([]);
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchOrgTree()
      .then(async (tree) => {
        const node = findNode(tree, current.id, current.kind);
        const b = node ? await loadInfrastructure(node) : EMPTY_INFRA_BOARD;
        if (cancelled) return;
        setBoard(b);
        setVenues(node ? venueOptions(node) : []);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return board.devices.filter((d) => {
      if (filter === "online" && !d.connected) return false;
      if (filter === "offline" && d.connected) return false;
      if (!q) return true;
      return [d.name, d.serialNumber, d.ipAddress, d.venueName, d.firmware, deviceClassLabel(d.klass)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [board.devices, filter, query]);

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: board.devices.length },
    { id: "online", label: "Online", count: board.online },
    { id: "offline", label: "Offline", count: board.offline },
  ];

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Infrastructure
        </h1>
        {current && (
          <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}: {current.name}
          </span>
        )}
      </div>

      {!current ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
          Select an organization to view its infrastructure.
        </p>
      ) : state === "error" ? (
        <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
          Could not reach the gateway service.
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
                placeholder="Search infrastructure…"
                className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
              />
            </div>

            <div className="flex items-center gap-1">
              {tabs.map((t) => {
                const on = filter === t.id;
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
                    {t.label}
                    <span className="font-mono text-[11px] text-[var(--qz-fg-4)]">({t.count})</span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium rounded-md px-[12px] py-[7px] cursor-pointer"
                style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
              >
                <Plus size={14} /> Add
              </button>
              <button
                type="button"
                onClick={() => setNonce((n) => n + 1)}
                aria-label="Refresh"
                title="Refresh"
                className="grid place-items-center w-8 h-8 rounded-md border border-[var(--qz-border)] bg-[var(--qz-input-bg)] text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] cursor-pointer"
              >
                <RefreshCw size={14} className={state === "loading" ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {state === "loading" ? (
            <div className="p-8 grid place-items-center">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading infrastructure…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 grid place-items-center">
              <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
                {board.devices.length === 0
                  ? "No infrastructure in this organization."
                  : "No devices match this filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="qz-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Venue</th>
                    <th>Firmware</th>
                    <th>IP Address</th>
                    <th>Clients</th>
                    <th>Traffic</th>
                    <th>Uptime</th>
                    <th>Last Contact</th>
                    <th>Temp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <DeviceRow key={d.serialNumber} d={d} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {adding && (
        <AddInfrastructureModal
          venues={venues}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            setNonce((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

/// In-scope venues for the venue picker, sorted by name.
function venueOptions(node: OrgNode): VenueOption[] {
  return collectVenues(node)
    .map((v) => ({ id: v.id, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const EMPTY_INFRA_DRAFT: InfraDraft = {
  mac: "",
  name: "",
  deviceType: "",
  venue: "",
  serialNumber: "",
  assetTag: "",
  shell: false,
};

function AddInfrastructureModal({
  venues,
  onClose,
  onCreated,
}: {
  venues: VenueOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [draft, setDraft] = useState<InfraDraft>(EMPTY_INFRA_DRAFT);
  const [types, setTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate the device-type dropdown (best-effort) and default the selection.
  useEffect(() => {
    let cancelled = false;
    fetchDeviceTypes().then((t) => {
      if (cancelled) return;
      setTypes(t);
      setDraft((d) => (d.deviceType ? d : { ...d, deviceType: t[0] ?? "" }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof InfraDraft>(k: K, v: InfraDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // Only the MAC is required — the remaining fields are visual for now.
  const macValid = isValidMac(draft.mac);
  const canSubmit = macValid && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await createInfrastructure(draft.mac);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the infrastructure.");
      setSaving(false);
    }
  };

  const labelCls = "block text-[12px] font-medium text-[var(--qz-fg-2)] mb-1.5";
  const inputCls =
    "w-full bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[8px] text-[13px] text-[var(--qz-fg-1)] outline-none focus:border-[var(--qz-accent-border)] placeholder:text-[var(--qz-fg-4)]";
  const req = <span style={{ color: "var(--qz-danger)" }}> *</span>;

  return (
    <div className="drawer-scrim grid place-items-center" onMouseDown={onClose}>
      <div
        className="surface w-[760px] max-w-[94vw] p-6"
        style={{ background: "var(--qz-surface-raised)", boxShadow: "var(--qz-shadow-3)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-semibold text-[var(--qz-fg-1)] m-0">Add infrastructure</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] bg-transparent border-0 p-0 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          {/* Row: MAC · Name */}
          <div>
            <label className={labelCls}>MAC Address{req}</label>
            <input
              autoFocus
              value={draft.mac}
              onChange={(e) => set("mac", e.target.value)}
              placeholder="E.g. 14:90:23:85:05:21"
              className={inputCls}
              style={draft.mac && !macValid ? { borderColor: "var(--qz-danger)" } : undefined}
            />
            {draft.mac !== "" && !macValid && (
              <p className="text-[11px] mt-1 mb-0" style={{ color: "var(--qz-danger)" }}>
                Enter a 12-digit MAC address.
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Name{req}</label>
            <input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="E.g. New Infrastructure"
              className={inputCls}
            />
          </div>

          {/* Row: shell checkbox · (spacer) */}
          <label className="flex items-center gap-2.5 text-[13px] text-[var(--qz-fg-2)] cursor-pointer select-none self-center">
            <input
              type="checkbox"
              className="qz-check"
              checked={draft.shell}
              onChange={(e) => set("shell", e.target.checked)}
            />
            Add as Infrastructure Shell
          </label>
          <div className="hidden md:block" />

          {/* Row: Device Type · Venue */}
          <div>
            <label className={labelCls}>Device Type{req}</label>
            <select
              value={draft.deviceType}
              onChange={(e) => set("deviceType", e.target.value)}
              className={inputCls}
            >
              {types.length === 0 && <option value="">Loading…</option>}
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Venue{req}</label>
            <select
              value={draft.venue}
              onChange={(e) => set("venue", e.target.value)}
              className={inputCls}
              style={draft.venue === "" ? { color: "var(--qz-fg-4)" } : undefined}
            >
              <option value="">Please select a venue</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Row: Serial Number · Asset Tag */}
          <div>
            <label className={labelCls}>Serial Number</label>
            <input
              value={draft.serialNumber}
              onChange={(e) => set("serialNumber", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Asset Tag</label>
            <input
              value={draft.assetTag}
              onChange={(e) => set("assetTag", e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {error && (
          <p className="text-[12px] mt-4 mb-0" style={{ color: "var(--qz-danger)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] rounded-md px-[16px] py-[8px] cursor-pointer border border-[var(--qz-border)] text-[var(--qz-fg-2)] hover:text-[var(--qz-fg-1)] bg-transparent"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="text-[13px] font-medium rounded-md px-[18px] py-[8px] cursor-pointer transition-opacity disabled:opacity-50"
            style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeviceRow({ d }: { d: InfraDevice }) {
  const TypeIcon = CLASS_ICON[d.klass];
  const tone = CLASS_TONE[d.klass];
  return (
    <tr>
      {/* Name + status dot + serial */}
      <td>
        <div className="flex items-center gap-2.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: d.connected ? "var(--qz-success)" : "var(--qz-danger)" }}
            title={d.connected ? "Online" : "Offline"}
          />
          <div className="flex flex-col">
            <span className="text-[var(--qz-fg-1)]">{d.name}</span>
            {d.name !== d.serialNumber && (
              <span className="text-[11px] text-[var(--qz-fg-4)] font-mono">{d.serialNumber}</span>
            )}
          </div>
        </div>
      </td>

      {/* Type */}
      <td>
        <span
          className="badge"
          style={{
            color: tone,
            borderColor: `color-mix(in oklab, ${tone} 38%, transparent)`,
            background: `color-mix(in oklab, ${tone} 12%, transparent)`,
          }}
        >
          <TypeIcon size={11} /> {deviceClassLabel(d.klass)}
        </span>
      </td>

      {/* Venue */}
      <td className="text-[12px] text-[var(--qz-fg-2)]">{d.venueName ?? "—"}</td>

      {/* Firmware */}
      <td className="text-[12px]">
        {d.firmware ? <span className="badge badge-muted">{d.firmware}</span> : "—"}
      </td>

      {/* IP */}
      <td className="mono text-[12px]">{d.ipAddress ?? "—"}</td>

      {/* Clients */}
      <td className="mono text-[12px]">{d.connected ? d.clients : "—"}</td>

      {/* Traffic */}
      <td className="text-[12px] text-[var(--qz-fg-3)] whitespace-nowrap">
        {d.txBytes || d.rxBytes ? (
          <span className="font-mono">
            ↓{formatBytes(d.rxBytes)} ↑{formatBytes(d.txBytes)}
          </span>
        ) : (
          "—"
        )}
      </td>

      {/* Uptime (connected-since) */}
      <td className="text-[12px] text-[var(--qz-fg-3)] whitespace-nowrap">
        {d.connected ? formatDuration(d.started) : "—"}
      </td>

      {/* Last contact */}
      <td className="text-[12px] text-[var(--qz-fg-3)] whitespace-nowrap">
        {d.lastContact ? `${formatDuration(d.lastContact)} ago` : "—"}
      </td>

      {/* Temperature */}
      <td className="mono text-[12px]">
        {d.temperature !== undefined ? `${Math.round(d.temperature)}°C` : "—"}
      </td>
    </tr>
  );
}
