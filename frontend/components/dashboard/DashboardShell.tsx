"use client";

import { Sidebar } from "@/components/dashboard/Sidebar";

/// Shared chrome for every console page: the sidebar shell. The login page at
/// the site root lives outside this and stays chrome-free.
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
