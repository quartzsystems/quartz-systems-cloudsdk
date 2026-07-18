"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useOrganization } from "@/lib/OrganizationContext";

/// Temporary scaffold page: a titled shell scoped to the current Organization.
/// Real console views replace these as they land.
export function PagePlaceholder({ title, blurb }: { title: string; blurb: string }) {
  const { current } = useOrganization();
  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          {title}
        </h1>
        {current && (
          <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}: {current.name}
          </span>
        )}
      </div>
      <div className="surface p-6 max-w-[560px]">
        <p className="text-[13px] text-[var(--qz-fg-3)] m-0">{blurb}</p>
      </div>
    </div>
  );
}
