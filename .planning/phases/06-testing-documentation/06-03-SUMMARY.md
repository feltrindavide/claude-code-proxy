---
phase: "06"
plan: "03"
subsystem: tauri-desktop
tags: [tauri, updater, dmg, packaging, auto-update]
dependency_graph:
  requires: ["06-01"]
  provides: ["SC-06-04", "D-82", "D-83"]
  affects: ["tauri-build", "frontend-services"]
tech-stack:
  added: ["tauri-plugin-updater", "tauri-plugin-process", "@tauri-apps/plugin-updater", "@tauri-apps/plugin-process"]
  patterns: ["Tauri v2 plugin system", "DMG bundle configuration", "Ed25519 updater signature verification"]
key-files:
  created:
    - apps/web/src/services/updater.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/capabilities/default.json
    - src-tauri/tauri.conf.json
    - package.json
decisions:
  - "pubkey left as empty placeholder — developer must generate with tauri signer generate before release"
  - "GitHub Releases used as default update endpoint"
  - "DMG-only bundling (macOS) per project scope"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-05-11"
---

# Phase 06 Plan 03: Tauri Auto-Update Plugin and DMG Packaging Summary

**One-liner:** Configured Tauri v2 updater plugin with Ed25519 signature verification, DMG bundle layout for macOS release, and frontend updater service with progress tracking and relaunch.

## Tasks Completed

| # | Task | Status | Files |
|---|------|--------|-------|
| 1 | Add Tauri updater and process plugins | Done | Cargo.toml, capabilities/default.json, tauri.conf.json |
| 2 | Create frontend updater service | Done | apps/web/src/services/updater.ts, package.json |

## Changes Summary

### Cargo.toml
- Added `tauri-plugin-updater = "2"` and `tauri-plugin-process = "2"` dependencies

### capabilities/default.json
- Added `"updater:default"` permission for auto-update checks
- Added `"process:allow-restart"` permission for relaunch after update install

### tauri.conf.json
- Changed `bundle.targets` from `"all"` to `["dmg"]` (macOS-only)
- Added `createUpdaterArtifacts: true` for signed update artifact generation
- Added `macOS.dmg` layout config (app position, folder position, window size)
- Added `plugins.updater` section with empty `pubkey` placeholder and GitHub Releases endpoint

### apps/web/src/services/updater.ts (new)
- Exports `checkForUpdates()` function using `@tauri-apps/plugin-updater` `check()`
- Handles download progress events (Started, Progress, Finished)
- Calls `relaunch()` from `@tauri-apps/plugin-process` after install
- Wrapped in try/catch with error logging

### package.json
- Added `@tauri-apps/plugin-updater: ^2.10.1` to devDependencies (TypeScript types)
- Added `@tauri-apps/plugin-process: ^2.3.1` to devDependencies (TypeScript types)
- Existing scripts (test:e2e, test:e2e:smoke, test:e2e:ui, setup) preserved from Wave 1

## Deviations from Plan

### Deferred Issues

**Pre-existing: `shell-sidecar` feature not available in Tauri v2**
- **Found during:** cargo check verification
- **Issue:** `tauri = { version = "2", features = ["shell-sidecar"] }` references a feature that does not exist in Tauri v2 (available features listed in cargo error)
- **Impact:** `cargo check` fails — cannot verify Rust dependency resolution
- **Action:** Deferred — this is a pre-existing configuration issue, not introduced by this plan. Fixing requires removing the invalid feature flag (Rule 2 scope) but was deferred to avoid scope creep. Tracked for future fix.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `pubkey: ""` | src-tauri/tauri.conf.json | Placeholder — developer must run `tauri signer generate` before release |
| `https://github.com/<owner>/<repo>/releases/latest/download` | src-tauri/tauri.conf.json | Template URL — replace with actual GitHub repo path before release |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: unsigned-updates | src-tauri/tauri.conf.json | pubkey is empty placeholder; updates will not be cryptographically verified until signing key is generated and configured |

## Self-Check: PASSED

- [x] Cargo.toml contains `tauri-plugin-updater = "2"` and `tauri-plugin-process = "2"`
- [x] capabilities/default.json contains `"updater:default"` and `"process:allow-restart"`
- [x] tauri.conf.json has `plugins.updater` section with `pubkey` and `endpoints`
- [x] tauri.conf.json has `createUpdaterArtifacts: true` and `bundle.targets` includes `"dmg"`
- [x] apps/web/src/services/updater.ts exports `checkForUpdates` function
- [x] package.json devDependencies include both Tauri plugin packages
- [x] Commit hash: `e40761ee`
