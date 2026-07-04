#!/usr/bin/env bash
# Headless proxy — run without Tauri desktop shell
set -euo pipefail
cd "$(dirname "$0")/../packages/proxy"
exec npx tsx src/index.ts
