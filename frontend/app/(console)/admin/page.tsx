"use client";

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/// Admin has no landing view of its own — send visitors to Settings.
export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/settings");
  }, [router]);
  return null;
}
