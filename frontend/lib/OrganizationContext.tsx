"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { OrgOption } from "@/lib/organizations";

// The Organization (or Venue) the console is currently scoped to. Persisted in
// localStorage so it survives reloads; pages read it to scope their queries.

const STORAGE_KEY = "quartz-cloudsdk-current-org";

interface OrganizationContextValue {
  current: OrgOption | null;
  setCurrent: (org: OrgOption) => void;
}

const OrganizationContext = createContext<OrganizationContextValue>({
  current: null,
  setCurrent: () => {},
});

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrentState] = useState<OrgOption | null>(null);

  // localStorage is unavailable during SSR/prerender — read it after mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCurrentState(JSON.parse(raw) as OrgOption);
    } catch {
      /* ignore malformed cache */
    }
  }, []);

  const setCurrent = useCallback((org: OrgOption) => {
    setCurrentState(org);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(org));
    } catch {
      /* storage unavailable — keep in-memory selection */
    }
  }, []);

  return (
    <OrganizationContext.Provider value={{ current, setCurrent }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
