"use client";

import { useEffect, useState } from "react";
import { CloudUser, fetchUsers } from "@/lib/users";

function formatLastLogin(epoch?: number): string {
  if (!epoch) return "Never";
  const d = new Date(epoch * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/// Settings → Security: table of all configured operator accounts (owsec).
export function SecurityTab() {
  const [users, setUsers] = useState<CloudUser[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((u) => {
        if (cancelled) return;
        setUsers(u);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <p className="text-[13px] text-[var(--qz-fg-4)] m-0">Loading users…</p>;
  }
  if (state === "error") {
    return (
      <p className="text-[13px] m-0" style={{ color: "var(--qz-danger)" }}>
        Could not reach the security service.
      </p>
    );
  }
  if (users.length === 0) {
    return <p className="text-[13px] text-[var(--qz-fg-4)] m-0">No users configured.</p>;
  }

  return (
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
              <tr key={u.id}>
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
  );
}
