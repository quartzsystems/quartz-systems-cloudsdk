"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/api";

/// Placeholder dashboard behind the auth guard. The real console views (device
/// inventory, provisioning, firmware, analytics) land on top of the CloudSDK
/// proxy next; this confirms the login → session → protected-page flow works
/// end-to-end.
export default function DashboardPage() {
  const [name, setName] = useState("");

  useEffect(() => {
    const u = getCurrentUser();
    setName(u?.full_name || u?.username || "");
  }, []);

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Dashboard
        </h1>
      </div>

      <div className="surface p-6 max-w-[560px]">
        <p className="text-[14px] text-[var(--qz-fg-1)] m-0 mb-2">
          Signed in{name ? ` as ${name}` : ""}.
        </p>
        <p className="text-[13px] text-[var(--qz-fg-3)] m-0">
          You're authenticated against the CloudSDK deployment. The console views
          for access points, clients, provisioning, firmware and analytics will
          land here, backed by the authenticated CloudSDK API proxy.
        </p>
      </div>
    </div>
  );
}
