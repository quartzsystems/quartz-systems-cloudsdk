#!/usr/bin/env bash

# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (C) 2026 Quartz Systems

# Build quartz-cloudsdk-webui_*.deb inside a Debian bookworm container that has
# a current Rust toolchain + Node, then drop the artifact into ./dist/. Run from
# anywhere; needs Docker. Works from a Windows checkout.
#
# Versioning: the base version comes from the repo-root VERSION file; the Debian
# revision is the git commit count, so every commit yields a new package version
# automatically (0.2.0-<count>). Computed on the host (which has the git repo)
# and passed into the container.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

base="$(tr -d ' \t\r\n' < "$here/VERSION")"
count="$(git -C "$here" rev-list --count HEAD 2>/dev/null || echo 0)"
hash="$(git -C "$here" rev-parse --short HEAD 2>/dev/null || echo nogit)"
debver="${base}-${count}"

echo "==> Building quartz-cloudsdk-webui ${debver} (commit ${hash}) .deb in rust:1-bookworm"
# MSYS_NO_PATHCONV stops Git Bash on Windows from rewriting the container-side
# paths (/src, -w) into Windows paths; it is an ignored no-op on Linux CI.
MSYS_NO_PATHCONV=1 docker run --rm \
  -e PKG_DEBVER="$debver" -e PKG_HASH="$hash" \
  -v "$here":/src -w /src rust:1-bookworm bash -euo pipefail -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends build-essential debhelper devscripts ca-certificates curl gnupg >/dev/null

  # Tailwind v4 needs Node >= 20; bookworm ships EOL Node 18 — use NodeSource.
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y --no-install-recommends nodejs >/dev/null

  # 1) Static-export the Next.js frontend into backend/www (on the mounted tree).
  ( cd frontend && rm -rf .next out && npm ci && npm run build )

  # 2) Stage a clean copy to build from, so the mounted tree — in particular the
  #    tracked debian/changelog we stamp below — is never modified on the host.
  rm -rf /build && mkdir /build
  tar --exclude=./dist --exclude=./.git --exclude=./frontend/node_modules \
      --exclude=./backend/target -cf - . | tar -xf - -C /build
  cd /build

  # 3) Stamp the changelog with the git-derived version so dpkg picks it up.
  cat > debian/changelog <<EOF
quartz-cloudsdk-webui (${PKG_DEBVER}) unstable; urgency=medium

  * Automated build from commit ${PKG_HASH}.

 -- Quartz Systems <cwellman@quartz.systems>  $(date -R)
EOF

  # Windows checkouts drop the exec bit; restore it for the maintainer scripts.
  chmod +x debian/rules debian/postinst debian/postrm

  # 4) Build the .deb. dpkg-buildpackage drops artifacts in the parent of the
  #    build tree (/), which is NOT the mounted volume — move them into
  #    /src/dist so they survive the container.
  dpkg-buildpackage -us -uc -b
  mkdir -p /src/dist
  mv /quartz-cloudsdk-webui_*.deb /src/dist/
'

echo "==> Done. Package(s) in dist/:"
ls -1 "$here"/dist/quartz-cloudsdk-webui_*.deb
