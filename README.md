# Quartz CloudSDK WebUI

Web management interface for a [Telecom Infra Project](https://telecominfraproject.com/)
**CloudSDK** (OpenWiFi) deployment. Installs alongside the CloudSDK on the same
Linux host and presents a console on **port 4443**.

Shares the Quartz Systems design system and the login flow with
[QuartzFire WebUI](../quartz-fire/quartzfire-webui).

- **`backend/`** — Rust (axum) daemon. Terminates TLS on `:4443`, serves the
  exported frontend as static files, authenticates operators against the
  CloudSDK security service (owsec), and reverse-proxies `/api/cloudsdk/*` to
  the CloudSDK API — injecting the bearer token server-side so it never reaches
  the browser.
- **`frontend/`** — Next.js app built with `output: 'export'` → static
  HTML/JS/CSS. No Node.js runtime on the appliance.
- **`packaging/`** — canonical systemd unit + config, shared by both package
  formats.
- **`debian/`** + **`rpm/`** — packaging that produces `quartz-cloudsdk-webui`
  as a `.deb` **and** an `.rpm`.

## Architecture

```
browser ──https──> quartz-cloudsdk-webui (axum + rustls) :4443
                     ├── /                    static files (exported Next.js; login shell)
                     ├── /api/auth/*          login/logout/me (session issue/verify)
                     └── /api/cloudsdk/* ─auth─> CloudSDK API (owgw, etc.)
                                                 (Authorization: Bearer injected)

login ─────────────> owsec :16001 /api/v1/oauth2   (verify credentials)
```

The backend owns `:4443` and terminates TLS itself (rustls, `ring` provider). A
self-signed certificate is generated on first start into the systemd state dir;
point `tls_cert_file` / `tls_key_file` at your own PKI to replace it.

### Authentication

Operators sign in with their CloudSDK accounts. The security model mirrors
QuartzFire's: the privileged upstream token never reaches the browser.

- `POST /api/auth/login` forwards the credentials to **owsec**'s OAuth2 endpoint
  (`/api/v1/oauth2`). On success owsec returns a bearer token, which the backend
  stores in an in-memory **session store** keyed by a random session id.
- The backend issues its **own** session as a JWT (HS256) carrying only that
  session id, in an `HttpOnly; SameSite=Lax; Secure` cookie — JS can never read
  it, and cross-site POSTs don't carry it. The signing secret is generated on
  first start into the state dir (`jwt.secret`, 0600).
- **Every** `/api/*` route except `/auth/login` and `/auth/logout` sits behind
  the auth middleware. The `/api/cloudsdk/*` proxy pulls the CloudSDK bearer
  token from the server-side session and injects it as `Authorization: Bearer`;
  the browser's session cookie is stripped before forwarding upstream.
- The session store is in-memory, so restarting the backend ends all sessions
  (users simply sign in again). Swap in a persistent store behind the same
  `AppState` API when that matters.

Calling a CloudSDK endpoint from the frontend goes through the proxy, e.g.:

```ts
import { cloudsdkApi } from "@/lib/api";
const devices = await cloudsdkApi("/api/v1/devices");
// → GET https://<cloudsdk_api_url>/api/v1/devices  with the session's bearer token
```

## Configure

`/etc/quartz-cloudsdk/webui.toml` (installed by the package, override on device):

```toml
listen            = "0.0.0.0:4443"
cloudsdk_owsec_url = "https://127.0.0.1:16001"   # owsec (auth)
cloudsdk_api_url   = "https://127.0.0.1:16002"   # owgw (proxied API base)
cloudsdk_accept_invalid_certs = true             # loopback self-signed CloudSDK certs
www_root          = "/usr/share/quartz-cloudsdk-webui/www"
tls_cert_file     = "/var/lib/quartz-cloudsdk-webui/tls/cert.pem"
tls_key_file      = "/var/lib/quartz-cloudsdk-webui/tls/key.pem"
jwt_secret_file   = "/var/lib/quartz-cloudsdk-webui/jwt.secret"
cookie_secure     = true      # set false only for plain-HTTP local dev
session_hours     = 12
```

Adjust `cloudsdk_owsec_url` / `cloudsdk_api_url` to match your deployment's
service ports.

## Build

Both formats build in a container with a current Rust toolchain + Node (distro
Rust is too old for axum 0.7). Each script exports the frontend, compiles the
backend, and drops the package in `dist/`.

```sh
./build-deb.sh    # → dist/quartz-cloudsdk-webui_0.1.0-1_*.deb
./build-rpm.sh    # → dist/quartz-cloudsdk-webui-0.1.0-1.*.rpm
```

The Rust build uses only the `ring` crypto provider, so it needs just a C
compiler — no cmake/nasm.

### Local development

```sh
# Frontend (hot reload at http://localhost:3000, proxying /api to a running backend)
cd frontend && npm install && npm run dev

# Backend (uses built-in defaults when the config file is absent; set
# cookie_secure=false in a local webui.toml for plain-HTTP dev)
cd backend && cargo run
```

`npm run build` static-exports the frontend into `backend/www`, which the
backend serves.

## Status

Login is implemented end-to-end: the sign-in page (Quartz design system, at `/`)
authenticates against the CloudSDK's owsec service, and the whole `/api/*`
surface — including the CloudSDK proxy — requires a session. `/dashboard` is a
placeholder behind the auth guard; the real console views (access points,
clients, provisioning, firmware, analytics) come next.
