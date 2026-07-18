#!/usr/bin/env bash
# Build quartz-cloudsdk-webui-*.rpm inside a Fedora container that has a current
# Rust toolchain + Node, then drop the artifact into ./dist/. Run from anywhere;
# needs Docker. Works from a Windows checkout.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
name="quartz-cloudsdk-webui"
version="0.1.0"

echo "==> Building ${name}-${version}.rpm in fedora:40"
# MSYS_NO_PATHCONV stops Git Bash on Windows from rewriting the container-side
# paths (/src, -w) into Windows paths; it is an ignored no-op on Linux CI.
MSYS_NO_PATHCONV=1 docker run --rm -v "$here":/src -w /src fedora:40 bash -euo pipefail -c "
  # NOTE: Fedora's packaged 'cargo' is deliberately NOT installed — it lags the
  # Rust version this backend's dependency tree requires (e.g. 'time' needs
  # rustc >= 1.88). Install a current stable toolchain via rustup instead, the
  # same way build-deb.sh relies on the 'rust:' base image. rpmbuild inherits
  # PATH, so cargo is found by the spec's %build step.
  dnf -q -y install rpm-build rpmdevtools systemd-rpm-macros gcc nodejs tar curl >/dev/null
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal >/dev/null 2>&1
  export PATH=\"\$HOME/.cargo/bin:\$PATH\"

  # 1) Static-export the Next.js frontend into backend/www.
  ( cd frontend && rm -rf .next out && npm ci && npm run build )

  # 2) Assemble a source tarball the spec's %setup expects, then build.
  rpmdev-setuptree
  stage=\$(mktemp -d)
  mkdir -p \"\$stage/${name}-${version}\"
  # Copy the tree (excluding heavy/irrelevant dirs) into the versioned prefix.
  tar --exclude=./dist --exclude=./.git --exclude=./frontend/node_modules \
      --exclude=./backend/target -cf - . | tar -xf - -C \"\$stage/${name}-${version}\"
  ( cd \"\$stage\" && tar -czf ~/rpmbuild/SOURCES/${name}-${version}.tar.gz ${name}-${version} )

  rpmbuild -bb rpm/${name}.spec

  mkdir -p /src/dist
  cp ~/rpmbuild/RPMS/*/${name}-${version}*.rpm /src/dist/
"

echo "==> Done. Package(s) in dist/:"
ls -1 "$here"/dist/${name}-${version}*.rpm
