"use client";

import {
  Gauge,
  Bell,
  MapPin,
  Users,
  Network,
  Server,
  Building2,
  Shield,
  SlidersHorizontal,
  Plug,
  LogOut,
  ChevronDown,
  ChevronRight,
  LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthUserInfo, getCurrentUser, logout as apiLogout } from "@/lib/api";
import { OrganizationSwitcher } from "@/components/dashboard/OrganizationSwitcher";

interface NavChild {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  children?: NavChild[];
}

const ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: Gauge,
    href: "/dashboard",
    children: [
      { id: "overview", label: "Dashboard", href: "/dashboard", icon: Gauge },
      { id: "notifications", label: "Notifications", href: "/dashboard/notifications", icon: Bell },
    ],
  },
  { id: "venues", label: "Venues", icon: MapPin, href: "/venues" },
  { id: "clients", label: "Clients", icon: Users, href: "/clients" },
  { id: "networks", label: "Networks", icon: Network, href: "/networks" },
  { id: "infrastructure", label: "Infrastructure", icon: Server, href: "/infrastructure" },
  { id: "organizations", label: "Organizations", icon: Building2, href: "/organizations" },
  {
    id: "admin",
    label: "Admin",
    icon: Shield,
    href: "/admin",
    children: [
      { id: "settings", label: "Settings", href: "/admin/settings", icon: SlidersHorizontal },
      { id: "integrations", label: "Integrations", href: "/admin/integrations", icon: Plug },
    ],
  },
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

  // Exact match for a leaf; prefix match for section parents (but not for
  // "/dashboard", which would swallow "/dashboard/notifications").
  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  // Expandable submenus: open if explicitly toggled, else default-open on the
  // active subtree.
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const isOpen = (item: NavItem) =>
    openMenus[item.id] ?? item.children!.some((c) => pathname === c.href);

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

      {/* Organization switcher (replaces the search bar) */}
      <div className="px-3 py-3 flex-shrink-0">
        <OrganizationSwitcher />
      </div>

      {/* Nav */}
      <div className="flex-1 min-h-0 overflow-auto px-3 flex flex-col gap-[2px] pt-1">
        {ITEMS.map((item) => {
          const Icon = item.icon;

          if (item.children) {
            const open = isOpen(item);
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenMenus((p) => ({ ...p, [item.id]: !open }))}
                  className={itemClass(false)}
                >
                  <Icon size={16} />
                  <span className="flex-1">{item.label}</span>
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {open && (
                  <div className="flex flex-col gap-[2px] mt-[2px] ml-[26px]">
                    {item.children.map((child) => {
                      const active = pathname === child.href;
                      const ChildIcon = child.icon;
                      return (
                        <Link
                          key={child.id}
                          href={child.href}
                          className={[
                            "flex items-center gap-[9px] px-[10px] py-[7px] rounded-md text-[13px] font-medium border transition-all duration-[120ms] no-underline",
                            active
                              ? "bg-[var(--qz-accent-soft)] text-[var(--qz-accent)] border-[color-mix(in_oklab,var(--qz-accent)_30%,transparent)]"
                              : "text-[var(--qz-fg-3)] border-transparent hover:text-[var(--qz-fg-1)] hover:bg-[color-mix(in_oklab,white_4%,transparent)]",
                          ].join(" ")}
                        >
                          <ChildIcon size={15} />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

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
