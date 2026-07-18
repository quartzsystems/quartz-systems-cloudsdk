"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, MapPin, ChevronsUpDown, Search, Check } from "lucide-react";
import { fetchOrgsAndVenues, OrgOption } from "@/lib/organizations";
import { useOrganization } from "@/lib/OrganizationContext";

/// Button + dropdown that sits where the search bar was: shows the Organization
/// (or Venue) the console is currently scoped to, and lists all Organizations
/// and Venues from CloudSDK (owprov) to switch between.
export function OrganizationSwitcher() {
  const { current, setCurrent } = useOrganization();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [venues, setVenues] = useState<OrgOption[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const ref = useRef<HTMLDivElement>(null);

  // Load the list the first time the dropdown is opened (and refresh on reopen).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState("loading");
    fetchOrgsAndVenues()
      .then(({ organizations, venues }) => {
        if (cancelled) return;
        setOrgs(organizations);
        setVenues(venues);
        setState("idle");
        // Default the current scope to the first Organization if none is set.
        if (!current && organizations[0]) setCurrent(organizations[0]);
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

  const filter = (list: OrgOption[]) =>
    query ? list.filter((o) => o.name.toLowerCase().includes(query.toLowerCase())) : list;

  const filteredOrgs = useMemo(() => filter(orgs), [orgs, query]);
  const filteredVenues = useMemo(() => filter(venues), [venues, query]);
  const empty = filteredOrgs.length === 0 && filteredVenues.length === 0;

  const pick = (org: OrgOption) => {
    setCurrent(org);
    setOpen(false);
    setQuery("");
  };

  const CurrentIcon = current?.kind === "venue" ? MapPin : Building2;

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
          {/* Search within the list */}
          <div className="flex items-center gap-2 px-[10px] py-2 border-b border-[var(--qz-border)]">
            <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search organizations & venues…"
              className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] placeholder:text-[var(--qz-fg-4)]"
            />
          </div>

          <div className="max-h-[320px] overflow-auto py-1">
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

            {state === "idle" && (
              <>
                {filteredOrgs.length > 0 && (
                  <Group title="Organizations">
                    {filteredOrgs.map((o) => (
                      <Row
                        key={`org-${o.id}`}
                        option={o}
                        icon={Building2}
                        selected={current?.id === o.id && current?.kind === o.kind}
                        onSelect={pick}
                      />
                    ))}
                  </Group>
                )}
                {filteredVenues.length > 0 && (
                  <Group title="Venues">
                    {filteredVenues.map((o) => (
                      <Row
                        key={`venue-${o.id}`}
                        option={o}
                        icon={MapPin}
                        selected={current?.id === o.id && current?.kind === o.kind}
                        onSelect={pick}
                      />
                    ))}
                  </Group>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 pb-1 pt-1 text-[9.5px] uppercase tracking-[0.1em] text-[var(--qz-fg-4)] font-mono">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  option,
  icon: Icon,
  selected,
  onSelect,
}: {
  option: OrgOption;
  icon: typeof Building2;
  selected: boolean;
  onSelect: (o: OrgOption) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option)}
      className="w-full flex items-center gap-2 px-3 py-[7px] text-left cursor-pointer text-[13px] text-[var(--qz-fg-2)] hover:bg-[color-mix(in_oklab,white_4%,transparent)] hover:text-[var(--qz-fg-1)]"
    >
      <Icon size={14} className="text-[var(--qz-fg-4)] flex-shrink-0" />
      <span className="flex-1 truncate">{option.name}</span>
      {selected && <Check size={14} className="text-[var(--qz-accent)] flex-shrink-0" />}
    </button>
  );
}
