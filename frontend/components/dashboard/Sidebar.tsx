"use client";

import {
  Gauge,
  Router,
  Users,
  ClipboardList,
  HardDriveDownload,
  BarChart3,
  Settings,
  Search,
  LogOut,
  LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthUserInfo, getCurrentUser, logout as apiLogout } from "@/lib/api";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

// CloudSDK (TIP OpenWiFi) domains. These are placeholder routes for now — the
// real console views land on top of the CloudSDK proxy next. Add sub-menus as
// the pages arrive (see quartzfire-webui's Sidebar for the nested pattern).
const ITEMS: NavItem[] = [
  { id: "overview", label: "Dashboard", icon: Gauge, href: "/dashboard" },
  { id: "devices", label: "Access Points", icon: Router, href: "/devices" },
  { id: "clients", label: "Clients", icon: Users, href: "/clients" },
  { id: "provisioning", label: "Provisioning", icon: ClipboardList, href: "/provisioning" },
  { id: "firmware", label: "Firmware", icon: HardDriveDownload, href: "/firmware" },
  { id: "analytics", label: "Analytics", icon: BarChart3, href: "/analytics" },
  { id: "system", label: "System", icon: Settings, href: "/system" },
];

/// Avatar initials: first letters of the full name's words when configured
/// ("Cody Wellman" → "CW"), otherwise the first two letters of the username.
function userInitials(user: AuthUserInfo): string {
  const words = (user.full_name ?? "").split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (words[0] ?? user.username).slice(0, 2).toUpperCase();
}

export function Sidebar() {
  // Static export emits trailing-slash routes, so normalise before comparing.
  const pathname = (usePathname() ?? "/").replace(/\/+$/, "") || "/";
  const router = useRouter();
  const [user, setUser] = useState<AuthUserInfo | null>(null);

  // localStorage is unavailable during SSR/prerender — read it after mount.
  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const logout = async () => {
    await apiLogout();
    router.push("/");
  };

  const itemClass = (active: boolean) =>
    [
      "flex items-center gap-[10px] px-[10px] py-[8px] rounded-md text-[13.5px] font-medium border transition-all duration-[120ms] no-underline w-full text-left cursor-pointer",
      active
        ? "bg-[var(--qz-accent-soft)] text-[var(--qz-accent)] border-[color-mix(in_oklab,var(--qz-accent)_30%,transparent)]"
        : "text-[var(--qz-fg-3)] border-transparent hover:text-[var(--qz-fg-1)] hover:bg-[color-mix(in_oklab,white_4%,transparent)]",
    ].join(" ");

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        borderRight: "1px solid var(--qz-border)",
        background: "var(--qz-ink-0)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-[10px] px-4 h-14 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--qz-border)" }}
      >
        <img src="/logo-mark.png" alt="Quartz Systems" className="w-7 h-7 flex-shrink-0" />
        <span
          className="font-bold text-[var(--qz-fg-1)] text-[15px]"
          style={{ letterSpacing: "-0.01em" }}
        >
          Quartz CloudSDK
        </span>
      </div>

      {/* Search (placeholder — a command palette lands with the console views) */}
      <div className="px-3 py-3 flex-shrink-0">
        <div className="w-full flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[7px] text-left opacity-60">
          <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
          <span
            className="flex-1 text-[13px] text-[var(--qz-fg-4)]"
            style={{ fontFamily: "var(--qz-font-sans)" }}
          >
            Search…
          </span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 min-h-0 overflow-auto px-3 flex flex-col gap-[2px] pt-1">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.id} href={item.href} className={itemClass(isActive(item.href))}>
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 px-4 py-3 flex items-center gap-[10px]"
        style={{ borderTop: "1px solid var(--qz-border)" }}
      >
        <div
          className="w-7 h-7 rounded-full grid place-items-center text-[var(--qz-fg-on-accent)] font-bold text-xs flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, var(--qz-green-700), var(--qz-green-500))",
          }}
        >
          {user ? userInitials(user) : "…"}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="text-[var(--qz-fg-1)] font-semibold text-[13px] truncate leading-tight">
            {user ? user.full_name || user.username : ""}
          </span>
          {user?.full_name && (
            <span className="text-[var(--qz-fg-4)] text-[11px] truncate leading-tight">
              {user.username}
            </span>
          )}
        </div>
        <button
          type="button"
          title="Log out"
          onClick={logout}
          className="flex-shrink-0 text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] transition-colors cursor-pointer bg-transparent border-0 p-0"
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}
