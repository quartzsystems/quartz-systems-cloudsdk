"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  CloudUser,
  UserDraft,
  USER_ROLES,
  createUser,
  updateUser,
  deleteUser,
  emptyDraft,
  draftFromUser,
} from "@/lib/users";

/// Slide-over form to create or edit an operator account (owsec). Exposes the
/// full CloudSDK option set: login email, name, description, role, password,
/// forced password change, suspension, and notes. On create the account is
/// stamped with `owner` (the scoped Organization) so it lists under it.
export function UserDrawer({
  user,
  owner,
  onClose,
  onSaved,
}: {
  /** The account being edited, or `null` to create a new one. */
  user: CloudUser | null;
  /** Organization id new accounts are scoped to. */
  owner?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [draft, setDraft] = useState<UserDraft>(() =>
    user ? draftFromUser(user) : emptyDraft(),
  );
  const [state, setState] = useState<"idle" | "saving" | "deleting" | "error">("idle");
  const [error, setError] = useState<string>("");

  // Reset the form whenever the target account changes.
  useEffect(() => {
    setDraft(user ? draftFromUser(user) : emptyDraft());
    setState("idle");
    setError("");
  }, [user]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof UserDraft>(key: K, value: UserDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim());
  const canSave =
    emailValid && !!draft.role && (isEdit || draft.password.length > 0) && state === "idle";

  const save = async () => {
    setState("saving");
    setError("");
    try {
      if (isEdit) await updateUser(user!.id, draft);
      else await createUser(draft, owner);
      onSaved();
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Could not save the account.");
    }
  };

  const remove = async () => {
    if (!user) return;
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    setState("deleting");
    setError("");
    try {
      await deleteUser(user.id);
      onSaved();
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Could not delete the account.");
    }
  };

  const inputStyle = {
    background: "var(--qz-input-bg)",
    border: "1px solid var(--qz-border)",
  } as const;
  const fieldClass =
    "w-full rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none transition-colors";
  const focus = (e: React.FocusEvent<HTMLElement>) =>
    (e.currentTarget.style.borderColor = "var(--qz-accent)");
  const blur = (e: React.FocusEvent<HTMLElement>) =>
    (e.currentTarget.style.borderColor = "var(--qz-border)");

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 h-14 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--qz-border)" }}
        >
          <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">
            {isEdit ? "Edit user" : "New user"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] bg-transparent border-0 p-1 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto px-5 py-5 flex flex-col gap-4">
          <Field label="Email" hint="Used as the login for this account.">
            <input
              type="email"
              value={draft.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="operator@example.com"
              className={`${fieldClass} mono`}
              style={inputStyle}
              onFocus={focus}
              onBlur={blur}
            />
          </Field>

          {isEdit && (
            <div className="flex items-center gap-2 -mt-1">
              <span className="text-[12px] text-[var(--qz-fg-3)]">Email status:</span>
              {user!.emailVerified === undefined ? (
                <span className="badge badge-muted">Unknown</span>
              ) : user!.emailVerified ? (
                <span className="badge badge-ok">Verified</span>
              ) : (
                <span className="badge badge-warn">Pending validation</span>
              )}
            </div>
          )}

          <Field label="Name">
            <input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Full name"
              className={fieldClass}
              style={inputStyle}
              onFocus={focus}
              onBlur={blur}
            />
          </Field>

          <Field label="Role">
            <select
              value={draft.role}
              onChange={(e) => set("role", e.target.value)}
              className={fieldClass}
              style={inputStyle}
              onFocus={focus}
              onBlur={blur}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={isEdit ? "New password" : "Password"}
            hint={isEdit ? "Leave blank to keep the current password." : undefined}
          >
            <input
              type="password"
              value={draft.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder={isEdit ? "••••••••" : "Set a password"}
              autoComplete="new-password"
              className={fieldClass}
              style={inputStyle}
              onFocus={focus}
              onBlur={blur}
            />
          </Field>

          <Field label="Description">
            <input
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Short description"
              className={fieldClass}
              style={inputStyle}
              onFocus={focus}
              onBlur={blur}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Internal notes"
              className={`${fieldClass} resize-y`}
              style={inputStyle}
              onFocus={focus}
              onBlur={blur}
            />
          </Field>

          <Toggle
            label="Require password change at next login"
            checked={draft.changePassword}
            onChange={(v) => set("changePassword", v)}
          />
          <Toggle
            label="Suspended"
            hint="A suspended account cannot sign in."
            checked={draft.suspended}
            onChange={(v) => set("suspended", v)}
          />

          {state === "error" && (
            <p className="text-[12px] m-0" style={{ color: "var(--qz-danger)" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid var(--qz-border)" }}
        >
          {isEdit ? (
            <Button kind="ghost" size="sm" icon={Trash2} onClick={remove} disabled={state !== "idle"}>
              {state === "deleting" ? "Deleting…" : "Delete"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button kind="ghost" size="sm" onClick={onClose} disabled={state === "saving" || state === "deleting"}>
              Cancel
            </Button>
            <Button kind="primary" size="sm" onClick={save} disabled={!canSave}>
              {state === "saving" ? "Saving…" : isEdit ? "Save changes" : "Create user"}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[var(--qz-fg-4)] mt-[6px] m-0">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`switch ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <div className="switch-knob" />
      </div>
      <div className="flex flex-col">
        <span className="text-[13px] text-[var(--qz-fg-2)] leading-tight">{label}</span>
        {hint && <span className="text-[11px] text-[var(--qz-fg-4)] mt-[2px]">{hint}</span>}
      </div>
    </div>
  );
}
