"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useCallback, useEffect, useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { CloudUser, fetchUsers } from "@/lib/users";
import { useOrganization } from "@/lib/OrganizationContext";
import { Button } from "@/components/ui/Button";
import { UserDrawer } from "@/components/admin/UserDrawer";

function formatLastLogin(epoch?: number): string {
  if (!epoch) return "Never";
  const d = new Date(epoch * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/// Admin → Settings → Security: operator accounts (owsec) scoped to the
/// currently-selected Organization, with create/edit/delete via a slide-over.
export function SecurityTab() {
  const { current } = useOrganization();
  const [users, setUsers] = useState<CloudUser[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  // `undefined` = drawer closed; `null` = creating; a user = editing.
  const [editing, setEditing] = useState<CloudUser | null | undefined>(undefined);

  // Only Organizations own accounts; a Venue scope has no user list.
  const orgId = current?.kind === "organization" ? current.id : undefined;

  const load = useCallback(() => {
    if (!orgId) {
      setUsers([]);
      setState("idle");
      return;
    }
    setState("loading");
    fetchUsers(orgId)
      .then((u) => {
        setUsers(u);
        setState("idle");
      })
      .catch(() => setState("error"));
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSaved = () => {
    setEditing(undefined);
    load();
  };

  if (!current) {
    return (
      <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
        Select an organization to manage its users.
      </p>
    );
  }
  if (!orgId) {
    return (
      <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
        Users are managed per organization. Select an organization to manage its users.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] text-[var(--qz-fg-4)] font-mono">
          {state === "idle" ? `${users.length} ${users.length === 1 ? "user" : "users"}` : ""}
        </span>
        <Button kind="primary" size="sm" icon={Plus} onClick={() => setEditing(null)}>
          New user
        </Button>
      </div>

      {state === "loading" ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading users…</p>
      ) : state === "error" ? (
        <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
          Could not reach the security service.
        </p>
      ) : users.length === 0 ? (
        <div className="surface p-8 flex flex-col items-center gap-3 text-center">
          <UserPlus size={22} className="text-[var(--qz-fg-4)]" />
          <p className="text-[13px] text-[var(--qz-fg-4)] m-0">
            No users in this organization yet.
          </p>
          <Button kind="secondary" size="sm" icon={Plus} onClick={() => setEditing(null)}>
            Add the first user
          </Button>
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="qz-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Last login</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} onClick={() => setEditing(u)}>
                    <td>{u.name || "—"}</td>
                    <td className="mono">{u.email || "—"}</td>
                    <td>{u.role || "—"}</td>
                    <td>{formatLastLogin(u.lastLogin)}</td>
                    <td>
                      <span className={`badge ${u.suspended ? "badge-crit" : "badge-ok"}`}>
                        {u.suspended ? "Suspended" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing !== undefined && (
        <UserDrawer
          user={editing}
          owner={orgId}
          onClose={() => setEditing(undefined)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
