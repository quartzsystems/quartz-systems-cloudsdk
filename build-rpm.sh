#!/usr/bin/env bash

# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (C) 2026 Quartz Systems

# Build quartz-cloudsdk-webui-*.rpm inside a Fedora container that has a current
# Rust toolchain + Node, then drop the artifact into ./dist/. Run from anywhere;
# needs Docker. Works from a Windows checkout.
#
# Versioning: the base Version comes from the repo-root VERSION file; the Release
# is the git commit count + short hash, so every commit yields a new package
# version automatically (0.2.0-<count>.g<hash>). Computed on the host and passed
# into the container via --define.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
name="quartz-cloudsdk-webui"

base="$(tr -d ' \t\r\n' < "$here/VERSION")"
count="$(git -C "$here" rev-list --count HEAD 2>/dev/null || echo 0)"
hash="$(git -C "$here" rev-parse --short HEAD 2>/dev/null || echo nogit)"
release="${count}.g${hash}"

echo "==> Building ${name}-${base}-${release} .rpm in fedora:40"
# MSYS_NO_PATHCONV: see build-deb.sh.
MSYS_NO_PATHCONV=1 docker run --rm \
  -e PKG_NAME="$name" -e PKG_BASE="$base" -e PKG_RELEASE="$release" \
  -v "$here":/src -w /src fedora:40 bash -euo pipefail -c '
  # Fedoras packaged cargo lags what this dep tree needs (time >= rustc 1.88);
  # install a current stable toolchain via rustup instead. rpmbuild inherits
  # PATH, so cargo is found by the spec %build step.
  dnf -q -y install rpm-build rpmdevtools systemd-rpm-macros gcc nodejs tar curl >/dev/null
  curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal >/dev/null 2>&1
  export PATH="$HOME/.cargo/bin:$PATH"

  # 1) Static-export the Next.js frontend into backend/www.
  ( cd frontend && rm -rf .next out && npm ci && npm run build )

  # 2) Assemble the source tarball the spec %setup expects (named for the base
  #    Version, which is what %{version} resolves to), then build with the
  #    git-derived version/release passed in as macros.
  rpmdev-setuptree
  stage=$(mktemp -d)
  mkdir -p "$stage/${PKG_NAME}-${PKG_BASE}"
  tar --exclude=./dist --exclude=./.git --exclude=./frontend/node_modules \
      --exclude=./backend/target -cf - . | tar -xf - -C "$stage/${PKG_NAME}-${PKG_BASE}"
  ( cd "$stage" && tar -czf ~/rpmbuild/SOURCES/${PKG_NAME}-${PKG_BASE}.tar.gz ${PKG_NAME}-${PKG_BASE} )

  rpmbuild -bb \
    --define "pkgversion ${PKG_BASE}" \
    --define "pkgrelease ${PKG_RELEASE}" \
    rpm/${PKG_NAME}.spec

  mkdir -p /src/dist
  cp ~/rpmbuild/RPMS/*/${PKG_NAME}-${PKG_BASE}-${PKG_RELEASE}*.rpm /src/dist/
'

echo "==> Done. Package(s) in dist/:"
ls -1 "$here"/dist/${name}-${base}-*.rpm
