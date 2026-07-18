// Operator accounts, read from the CloudSDK security service (owsec) via the
// authenticated /api/owsec/* proxy. Backs the Settings → Security table.

import { securityApi } from "@/lib/api";

export interface CloudUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
  /** Epoch seconds of the last successful login, when reported. */
  lastLogin?: number;
  suspended?: boolean;
}

interface OwsecUser {
  id?: string;
  Id?: string;
  email?: string;
  name?: string;
  userRole?: string;
  role?: string;
  lastLogin?: number;
  suspended?: boolean;
}

/// owsec returns `{ users: [...] }`; tolerate a bare array too.
export async function fetchUsers(): Promise<CloudUser[]> {
  const raw = await securityApi<unknown>("/api/v1/users");
  const list: OwsecUser[] = Array.isArray(raw)
    ? (raw as OwsecUser[])
    : (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).users)
        ? ((raw as Record<string, unknown>).users as OwsecUser[])
        : []);
  return list.map((u) => ({
    id: u.id ?? u.Id ?? u.email ?? "",
    email: u.email ?? "",
    name: u.name?.trim() || undefined,
    role: u.userRole ?? u.role,
    lastLogin: u.lastLogin,
    suspended: u.suspended,
  }));
}
