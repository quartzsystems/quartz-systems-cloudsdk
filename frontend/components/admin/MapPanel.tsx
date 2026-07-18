"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

// Shows the given address on a map. Geocodes with OpenStreetMap's Nominatim and
// embeds the OSM slippy map (no map-library dependency). Both are external
// requests: on an isolated appliance network they simply won't resolve, so the
// panel degrades to a clear message and can be repointed at an internal
// geocoder / tile server later.

interface Located {
  lat: string;
  lon: string;
  // Nominatim boundingbox: [south, north, west, east]
  bbox: [string, string, string, string];
}

export function MapPanel({ address }: { address: string }) {
  const [located, setLocated] = useState<Located | null>(null);
  const [state, setState] = useState<"empty" | "loading" | "idle" | "error">("empty");

  useEffect(() => {
    const q = address.trim();
    if (!q) {
      setLocated(null);
      setState("empty");
      return;
    }
    let cancelled = false;
    setState("loading");
    // Debounce so we don't geocode on every keystroke.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
          { headers: { Accept: "application/json" } },
        );
        const data = (await res.json()) as Array<{ lat: string; lon: string; boundingbox: string[] }>;
        if (cancelled) return;
        const hit = data?.[0];
        if (hit && hit.boundingbox?.length === 4) {
          setLocated({ lat: hit.lat, lon: hit.lon, bbox: hit.boundingbox as Located["bbox"] });
          setState("idle");
        } else {
          setLocated(null);
          setState("error");
        }
      } catch {
        if (!cancelled) {
          setLocated(null);
          setState("error");
        }
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address]);

  if (state === "idle" && located) {
    const [south, north, west, east] = located.bbox;
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${west},${south},${east},${north}&layer=mapnik&marker=${located.lat},${located.lon}`;
    return (
      <iframe
        title="Location map"
        src={src}
        className="w-full h-full min-h-[320px] border-0"
        loading="lazy"
      />
    );
  }

  const message =
    state === "loading"
      ? "Locating…"
      : state === "error"
        ? "Couldn't locate this address."
        : "Enter an address to see it on the map.";

  return (
    <div className="w-full h-full min-h-[320px] grid place-items-center bg-[var(--qz-surface-sunken)]">
      <div className="flex flex-col items-center gap-2 text-[var(--qz-fg-4)]">
        <MapPin size={22} />
        <p className="text-[12px] m-0">{message}</p>
      </div>
    </div>
  );
}
