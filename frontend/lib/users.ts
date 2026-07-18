// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

// Operator accounts, managed through the CloudSDK security service (owsec) via
// the authenticated /api/owsec/* proxy. Backs the Admin → Settings → Security
// table and its create/edit user drawer.
//
// Accounts are scoped to an Organization (owprov entity) through owsec's
// `owner` field: a user created while an Organization is selected is stamped
// with that entity id, and the Security table lists only the users owned by the
// currently-scoped Organization.

import { securityApi } from "@/lib/api";

/// owsec operator roles. Mirrors the CloudSDK security service's role set so the
/// create/edit form exposes every option CloudSDK supports.
export const USER_ROLES = [
  "root",
  "admin",
  "subscriber",
  "csr",
  "system",
  "installer",
  "noc",
  "accounting",
  "partner",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface CloudUser {
  id: string;
  email: string;
  name?: string;
  description?: string;
  role?: string;
  notes?: string;
  /** Organization (owprov entity) id this account is scoped to. */
  owner?: string;
  /** Epoch seconds of the last successful login, when reported. */
  lastLogin?: number;
  suspended?: boolean;
  /** Force a password change on next login. */
  changePassword?: boolean;
}

/// Fields the create/edit drawer collects. `password` is only sent when set
/// (required on create, optional on edit — leave blank to keep the current one).
export interface UserDraft {
  email: string;
  name: string;
  description: string;
  role: string;
  notes: string;
  suspended: boolean;
  changePassword: boolean;
  password: string;
}

interface OwsecNote {
  note?: string;
}

interface OwsecUser {
  id?: string;
  Id?: string;
  email?: string;
  name?: string;
  description?: string;
  userRole?: string;
  role?: string;
  notes?: OwsecNote[] | string;
  owner?: string;
  lastLogin?: number;
  suspended?: boolean;
  changePassword?: boolean;
}

/// owsec carries notes as a list of `{ note }` objects; flatten to a string for
/// display/editing (tolerate a bare string too).
function flattenNotes(notes: OwsecUser["notes"]): string {
  if (typeof notes === "string") return notes;
  if (Array.isArray(notes)) {
    return notes
      .map((n) => n?.note?.trim())
      .filter((s): s is string => !!s)
      .join("\n");
  }
  return "";
}

function normalize(u: OwsecUser): CloudUser {
  return {
    id: u.id ?? u.Id ?? u.email ?? "",
    email: u.email ?? "",
    name: u.name?.trim() || undefined,
    description: u.description?.trim() || undefined,
    role: u.userRole ?? u.role,
    notes: flattenNotes(u.notes) || undefined,
    owner: u.owner || undefined,
    lastLogin: u.lastLogin,
    suspended: u.suspended,
    changePassword: u.changePassword,
  };
}

/// owsec returns `{ users: [...] }`; tolerate a bare array too.
function extractUsers(raw: unknown): OwsecUser[] {
  if (Array.isArray(raw)) return raw as OwsecUser[];
  if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).users)) {
    return (raw as Record<string, unknown>).users as OwsecUser[];
  }
  return [];
}

/// All operator accounts owned by `orgId` (the currently-scoped Organization).
/// Passing no id returns every account (used only outside an org scope).
export async function fetchUsers(orgId?: string): Promise<CloudUser[]> {
  const raw = await securityApi<unknown>("/api/v1/users");
  const users = extractUsers(raw).map(normalize);
  return orgId ? users.filter((u) => u.owner === orgId) : users;
}

/// Body shared by create + update. owsec expects `userRole`, notes as objects,
/// and the password in `currentPassword`.
function toOwsecBody(draft: UserDraft, owner?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: draft.email.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    userRole: draft.role,
    suspended: draft.suspended,
    changePassword: draft.changePassword,
  };
  if (owner) body.owner = owner;
  if (draft.notes.trim()) body.notes = [{ note: draft.notes.trim() }];
  if (draft.password) body.currentPassword = draft.password;
  return body;
}

/// Create a new operator account owned by `owner` (the scoped Organization).
export async function createUser(draft: UserDraft, owner?: string): Promise<void> {
  await securityApi("/api/v1/user/0", {
    method: "POST",
    body: JSON.stringify({ id: "0", ...toOwsecBody(draft, owner) }),
  });
}

/// Update an existing operator account. A blank password leaves it unchanged.
export async function updateUser(id: string, draft: UserDraft): Promise<void> {
  await securityApi(`/api/v1/user/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(toOwsecBody(draft)),
  });
}

/// Delete an operator account.
export async function deleteUser(id: string): Promise<void> {
  await securityApi(`/api/v1/user/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/// A blank draft, defaulted to the most common operator role.
export function emptyDraft(): UserDraft {
  return {
    email: "",
    name: "",
    description: "",
    role: "admin",
    notes: "",
    suspended: false,
    changePassword: false,
    password: "",
  };
}

/// Prefill a draft from an existing account for editing.
export function draftFromUser(u: CloudUser): UserDraft {
  return {
    email: u.email,
    name: u.name ?? "",
    description: u.description ?? "",
    role: u.role ?? "admin",
    notes: u.notes ?? "",
    suspended: !!u.suspended,
    changePassword: !!u.changePassword,
    password: "",
  };
}
