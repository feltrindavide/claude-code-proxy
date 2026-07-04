#!/usr/bin/env bash
# Build Linux .deb and AppImage via Tauri.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

echo "=== Claude Code Proxy — Linux build ==="

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required." >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "Error: Rust/cargo is required for Tauri builds." >&2
  exit 1
fi

npm ci
npm run build
bash scripts/bundle-proxy.sh

cd src-tauri
cargo tauri build --bundles deb,appimage

echo ""
echo "[OK] Artifacts in src-tauri/target/release/bundle/"
