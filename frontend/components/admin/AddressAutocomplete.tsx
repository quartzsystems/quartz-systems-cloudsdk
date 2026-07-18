"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, Loader2 } from "lucide-react";

// Address field with a type-ahead chooser. As the operator types, it queries
// OpenStreetMap's Nominatim geocoder and offers matching addresses to pick from,
// so the saved value is a real, geocodable address (the Overview map reads the
// same value). Nominatim is an external request: on an isolated appliance
// network it simply won't resolve and the field degrades to a plain text input,
// and it can be repointed at an internal geocoder later.

interface Suggestion {
  label: string;
  lat: string;
  lon: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (address: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [active, setActive] = useState(-1);
  // Suppress the next lookup after the operator picks a suggestion (so choosing
  // an item doesn't immediately re-open the list).
  const justPicked = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    // Debounce so we don't geocode on every keystroke.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=6&q=${encodeURIComponent(q)}`,
          { headers: { Accept: "application/json" } },
        );
        const data = (await res.json()) as Array<{
          display_name: string;
          lat: string;
          lon: string;
        }>;
        if (cancelled) return;
        setSuggestions(
          (data ?? []).map((d) => ({ label: d.display_name, lat: d.lat, lon: d.lon })),
        );
        setActive(-1);
        setState("idle");
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setState("error");
        }
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  // Close the list on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (s: Suggestion) => {
    justPicked.current = true;
    onChange(s.label);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const inputStyle = {
    background: "var(--qz-input-bg)",
    border: "1px solid var(--qz-border)",
  } as const;
  const showList = open && (state === "loading" || suggestions.length > 0);

  return (
    <div className="relative" ref={ref}>
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.style.borderColor = "var(--qz-accent)";
        }}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qz-border)")}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={3}
        placeholder="Start typing an address…"
        className="w-full rounded-md px-3 py-[10px] text-[13px] text-[var(--qz-fg-1)] outline-none transition-colors resize-y"
        style={inputStyle}
      />

      {showList && (
        <div
          className="absolute left-0 right-0 mt-1 z-40 rounded-lg overflow-hidden"
          style={{
            background: "var(--qz-surface-raised)",
            border: "1px solid var(--qz-border)",
            boxShadow: "var(--qz-shadow-2)",
          }}
        >
          {state === "loading" && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-[10px] text-[12px] text-[var(--qz-fg-4)]">
              <Loader2 size={13} className="animate-spin" />
              Searching addresses…
            </div>
          ) : (
            <ul className="m-0 p-1 list-none max-h-[240px] overflow-auto">
              {suggestions.map((s, i) => (
                <li key={`${s.lat},${s.lon},${i}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    onMouseEnter={() => setActive(i)}
                    className={[
                      "w-full flex items-start gap-2 px-[10px] py-[8px] rounded-md text-left text-[12.5px] cursor-pointer bg-transparent border-0 transition-colors",
                      i === active
                        ? "bg-[var(--qz-accent-soft)] text-[var(--qz-accent)]"
                        : "text-[var(--qz-fg-2)] hover:bg-[color-mix(in_oklab,white_4%,transparent)]",
                    ].join(" ")}
                  >
                    <MapPin size={13} className="flex-shrink-0 mt-[2px] text-[var(--qz-fg-4)]" />
                    <span className="flex-1">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-[var(--qz-fg-4)] mt-[6px] m-0 flex items-center gap-[6px]">
        <Search size={11} />
        {state === "error"
          ? "Address lookup unavailable — enter the address manually."
          : "Pick a suggestion or type the full address."}
      </p>
    </div>
  );
}
