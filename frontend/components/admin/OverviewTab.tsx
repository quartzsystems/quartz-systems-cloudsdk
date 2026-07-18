"use client";

import { useEffect, useState } from "react";
import { Building2, Network } from "lucide-react";
import { useOrganization } from "@/lib/OrganizationContext";
import { fetchOrgSettings, saveOrgSettings } from "@/lib/settings";
import { Button } from "@/components/ui/Button";
import { MapPanel } from "@/components/admin/MapPanel";

/// Settings → Overview: editable Name + Address for the current Organization
/// (or Venue), with a live map of the address on the right.
export function OverviewTab() {
  const { current } = useOrganization();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loaded, setLoaded] = useState<{ name: string; address: string } | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("idle");

  // Re-load whenever the scoped Organization changes.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setState("loading");
    fetchOrgSettings(current)
      .then((s) => {
        if (cancelled) return;
        setName(s.name);
        setAddress(s.address);
        setLoaded(s);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) {
    return (
      <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
        Select an organization to view its settings.
      </p>
    );
  }

  const dirty = !!loaded && (name !== loaded.name || address !== loaded.address);
  const Icon = current.kind === "venue" ? Building2 : Network;

  const save = async () => {
    setState("saving");
    try {
      await saveOrgSettings(current, { name, address });
      setLoaded({ name, address });
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setState("error");
    }
  };

  const reset = () => {
    if (loaded) {
      setName(loaded.name);
      setAddress(loaded.address);
    }
  };

  const inputStyle = {
    background: "var(--qz-input-bg)",
    border: "1px solid var(--qz-border)",
  } as const;
  const fieldClass =
    "w-full rounded-md px-3 py-[10px] text-[13px] text-[var(--qz-fg-1)] outline-none transition-colors";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-[1000px]">
      {/* Form */}
      <div className="surface p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-[var(--qz-accent)]" />
          <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}
          </span>
        </div>

        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={state === "loading"}
            className={fieldClass}
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--qz-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qz-border)")}
          />
        </div>

        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={state === "loading"}
            rows={3}
            placeholder="Street, city, state, postal code"
            className={`${fieldClass} resize-y`}
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--qz-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qz-border)")}
          />
          <p className="text-[11px] text-[var(--qz-fg-4)] mt-[6px] m-0">
            Used to locate this {current.kind === "venue" ? "venue" : "organization"} on the map.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button kind="primary" size="sm" onClick={save} disabled={!dirty || state === "saving"}>
            {state === "saving" ? "Saving…" : "Save changes"}
          </Button>
          <Button kind="ghost" size="sm" onClick={reset} disabled={!dirty || state === "saving"}>
            Reset
          </Button>
          {state === "saved" && (
            <span className="text-[12px]" style={{ color: "var(--qz-success)" }}>
              Saved
            </span>
          )}
          {state === "error" && (
            <span className="text-[12px]" style={{ color: "var(--qz-danger)" }}>
              Couldn&apos;t save changes
            </span>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="surface p-0 overflow-hidden">
        <MapPanel address={address} />
      </div>
    </div>
  );
}
