"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, Search, MapPin } from "lucide-react";
import { VenueRow } from "@/lib/dashboard";

type Filter = "all" | "critical" | "major";

/// Site-Alarms: venues under the current Organization that have active alarms,
/// filterable by severity (All / Critical / Major) and searchable by name.
export function AlarmsTable({ venues }: { venues: VenueRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const alarming = useMemo(() => venues.filter((v) => v.critical + v.major > 0), [venues]);
  const counts = useMemo(
    () => ({
      all: alarming.length,
      critical: alarming.filter((v) => v.critical > 0).length,
      major: alarming.filter((v) => v.major > 0).length,
    }),
    [alarming],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alarming.filter((v) => {
      const sev = filter === "all" || (filter === "critical" ? v.critical > 0 : v.major > 0);
      const text = !q || v.name.toLowerCase().includes(q);
      return sev && text;
    });
  }, [alarming, filter, query]);

  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: `All (${counts.all})` },
    { id: "critical", label: `Critical (${counts.critical})` },
    { id: "major", label: `Major (${counts.major})` },
  ];

  return (
    <div className="surface overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap border-b border-[var(--qz-border)]">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--qz-fg-1)]">
          <MapPin size={15} className="text-[var(--qz-accent)]" />
          Site-Alarms
        </span>

        <div className="flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[6px] w-[220px]">
          <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search venues…"
            className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
          />
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {tabs.map((t) => {
            const on = filter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
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
      </div>

      {rows.length === 0 ? (
        <div className="p-8 grid place-items-center">
          <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
            {alarming.length === 0
              ? "No active alarms in this organization."
              : "No venues match this filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="qz-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Alarms</th>
                <th>Infrastructure</th>
                <th>Clients</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-[var(--qz-fg-1)]">{v.name}</span>
                      {v.offlineNote && (
                        <span className="text-[11px] text-[var(--qz-fg-4)]">{v.offlineNote}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      {v.critical > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-[12px] font-mono"
                          style={{ color: "var(--qz-danger)" }}
                        >
                          <AlertOctagon size={14} />
                          {v.critical}
                        </span>
                      )}
                      {v.major > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-[12px] font-mono"
                          style={{ color: "var(--qz-warn)" }}
                        >
                          <AlertTriangle size={14} />
                          {v.major}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className="font-mono text-[12px]"
                      style={{
                        color:
                          v.infraOnline < v.infraTotal
                            ? "var(--qz-warn)"
                            : "var(--qz-fg-2)",
                      }}
                    >
                      {v.infraOnline}
                      <span className="text-[var(--qz-fg-4)]">/{v.infraTotal}</span>
                    </span>
                  </td>
                  <td className="mono">{v.clients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
