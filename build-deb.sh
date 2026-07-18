#!/usr/bin/env bash
# Build quartz-cloudsdk-webui_*.deb inside a Debian bookworm container that has
# a current Rust toolchain + Node, then drop the artifact into ./dist/. Run from
# anywhere; needs Docker. Works from a Windows checkout (mounts the repo and
# fixes exec bits inside the container).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

echo "==> Building quartz-cloudsdk-webui .deb in rust:1-bookworm"
# MSYS_NO_PATHCONV stops Git Bash on Windows from rewriting the container-side
# paths (/src, -w) into Windows paths; it is an ignored no-op on Linux CI.
MSYS_NO_PATHCONV=1 docker run --rm -v "$here":/src -w /src rust:1-bookworm bash -euo pipefail -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends build-essential debhelper devscripts ca-certificates curl gnupg >/dev/null

  # Tailwind v4 needs Node >= 20; bookworm ships EOL Node 18 — use NodeSource.
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y --no-install-recommends nodejs >/dev/null

  # Windows checkouts drop the exec bit; restore it for the maintainer scripts.
  chmod +x debian/rules debian/postinst debian/postrm

  # 1) Static-export the Next.js frontend into backend/www.
  #    npm ci (not install) wipes node_modules first so any Windows-platform
  #    native bindings from the host mount are replaced with Linux ones.
  ( cd frontend && rm -rf .next out && npm ci && npm run build )

  # 2) Build the .deb. dpkg-buildpackage drops artifacts in the parent of the
  #    source tree (/), which is NOT on the mounted volume — move them into
  #    /src/dist so they survive the container.
  dpkg-buildpackage -us -uc -b
  mkdir -p /src/dist
  mv /quartz-cloudsdk-webui_*.deb /src/dist/
'

echo "==> Done. Package(s) in dist/:"
ls -1 "$here"/dist/quartz-cloudsdk-webui_*.deb
