"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { Sidebar } from "@/components/dashboard/Sidebar";
import { OrganizationProvider } from "@/lib/OrganizationContext";

/// Shared chrome for every console page: the sidebar shell, scoped to the
/// currently-selected Organization. The login page at the site root lives
/// outside this and stays chrome-free.
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <OrganizationProvider>
      <div
        className="h-screen overflow-hidden"
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gridTemplateRows: "minmax(0, 1fr)",
        }}
      >
        <Sidebar />
        <main className="overflow-auto" style={{ background: "var(--qz-bg)" }}>
          {children}
        </main>
      </div>
    </OrganizationProvider>
  );
}
