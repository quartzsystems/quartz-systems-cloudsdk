// Central API helpers for talking to the Quartz CloudSDK backend (axum).
//
// Auth is an httpOnly cookie set by the backend after it verifies the
// credentials against the CloudSDK security service (owsec). The backend holds
// the CloudSDK bearer token server-side, keyed by the session — the browser
// never sees it. JS can't read the session cookie either; the only client-side
// session state is a non-sensitive cached user (for display). The server is the
// real enforcement — every /api route, including the CloudSDK proxy, requires a
// valid session.

export const API = "/api";

const USER_KEY = "quartz-cloudsdk-user";

/// Error from the backend carrying the HTTP status, so callers can tell an
/// invalid session (401) apart from a backend that is down or restarting
/// (5xx / network failure, status 0). Only a 401 means "sign in again".
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface AuthUserInfo {
  username: string;
  role: string;
  /** Display name from the owsec profile, when available. */
  full_name?: string;
}

export function setUser(user: AuthUserInfo): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getCurrentUser(): AuthUserInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUserInfo) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

/// Bounce to the login page (which lives at the site root).
function redirectToLogin(): void {
  if (typeof window !== "undefined" && window.location.pathname !== "/") {
    window.location.href = "/";
  }
}

export async function login(username: string, password: string): Promise<AuthUserInfo> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let message = "Invalid username or password.";
    if (res.status !== 401) {
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch {}
    }
    throw new Error(message);
  }
  // Session is set via httpOnly cookie; the body is the user (for display).
  const user = (await res.json()) as AuthUserInfo;
  setUser(user);
  return user;
}

/// Confirm the session with the backend (cookie is invisible to JS) and refresh
/// the cached user. Rejects when there is no valid session.
export async function fetchMe(): Promise<AuthUserInfo> {
  const user = await apiFetch<AuthUserInfo>("/auth/me");
  setUser(user);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
  } catch {}
  clearSession();
}

/// Authenticated JSON fetch against the backend. On a 401 clears the session
/// and bounces to the login page (enforcement is real on the server).
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Could not reach the server.", 0);
  }

  if (res.status === 401) {
    clearSession();
    redirectToLogin();
    throw new ApiError("Session expired. Please sign in again.", 401);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new ApiError(message, res.status);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ── CloudSDK API proxy ──────────────────────────────────────────────────────
//
// Call a CloudSDK microservice endpoint through the authenticated backend
// proxy. The backend injects the `Authorization: Bearer <token>` header
// server-side (the token it received from owsec at login) so it never reaches
// the browser. `path` is relative to the CloudSDK API base, e.g.
// `/api/v1/devices` → proxied to the configured upstream.
export async function cloudsdkApi<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return apiFetch<T>(`/cloudsdk${path.startsWith("/") ? path : `/${path}`}`, init);
}

/// Call the CloudSDK provisioning service (owprov) through the authenticated
/// backend proxy. owprov owns Organizations (entities) and Venues. Same
/// server-side bearer-token injection as `cloudsdkApi`.
export async function provisioningApi<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return apiFetch<T>(`/owprov${path.startsWith("/") ? path : `/${path}`}`, init);
}

/// Call the CloudSDK security service (owsec) through the authenticated backend
/// proxy. owsec owns operator accounts. Same server-side bearer-token injection
/// as `cloudsdkApi`.
export async function securityApi<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return apiFetch<T>(`/owsec${path.startsWith("/") ? path : `/${path}`}`, init);
}
