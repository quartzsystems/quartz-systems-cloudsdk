"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { SecurityTab } from "@/components/admin/SecurityTab";
import { useOrganization } from "@/lib/OrganizationContext";

type TabId = "overview" | "security";

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const { current } = useOrganization();

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-center justify-between mb-4">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Settings
        </h1>
        {current && (
          <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
            {current.kind === "venue" ? "Venue" : "Organization"}: {current.name}
          </span>
        )}
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "security", label: "Security" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-6">{tab === "overview" ? <OverviewTab /> : <SecurityTab />}</div>
    </div>
  );
}
