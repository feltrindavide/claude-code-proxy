---
phase: "03"
plan: "01"
subsystem: desktop-shell
tags: [tauri, rust, express, lifecycle, monorepo]
dependency_graph:
  requires: []
  provides: [tauri-app-shell, proxy-lifecycle-commands, admin-api-mounted]
  affects: [packages/proxy, src-tauri]
tech_stack:
  added: [Tauri 2.x, Rust, reqwest, tauri-plugin-shell]
  patterns: [child-process-spawn, health-polling, mutex-state]
key_files:
  created:
    - package.json
    - src-tauri/Cargo.toml
    - src-tauri/build.rs
    - src-tauri/tauri.conf.json
    - src-tauri/src/lib.rs
    - src-tauri/capabilities/default.json
  modified:
    - packages/proxy/package.json
    - packages/proxy/tsconfig.json
    - packages/proxy/src/index.ts
decisions:
  - "Use tsx for proxy execution instead of compiled dist/ (NodeNext import incompatibility across codebase)"
  - "Tauri beforeDevCommand backgrounds proxy with & then starts Next.js dev server"
  - "Admin routes mounted at /admin prefix, existing root-level routes preserved for backward compatibility"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-10T22:15:00Z"
---

# Phase 03 Plan 01: Tauri 2.x App Shell + Express Lifecycle Summary

**One-liner:** Tauri 2.x desktop app shell with Rust commands for Express proxy start/stop/health monitoring, monorepo workspaces, and admin API routes mounted at /admin prefix.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Create monorepo root + Tauri 2.x structure | 3206585 | ✅ Done |
| 2 | Rust commands for proxy lifecycle | 3206585 | ✅ Done |
| 3 | Mount admin API routes in Express | 12ac7a6 | ✅ Done |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] NodeNext module resolution incompatibility**
- **Found during:** Task 1 — proxy build verification
- **Issue:** Existing proxy codebase uses `moduleResolution: "bundler"` without `.js` extensions on imports. Switching to `NodeNext` (required for `node dist/index.js` execution) caused 20+ compilation errors across the codebase.
- **Fix:** Reverted to `bundler` moduleResolution. Updated Tauri `beforeDevCommand` to use `npx tsx` to run TypeScript source directly instead of compiled output. Updated Rust `start_proxy` command to spawn `npx tsx packages/proxy/src/index.ts`.
- **Files modified:** packages/proxy/tsconfig.json, src-tauri/tauri.conf.json, src-tauri/src/lib.rs
- **Commit:** 3206585

## Key Decisions

1. **tsx over compiled dist:** Using `npx tsx` to run proxy source directly avoids the need to add `.js` extensions to 20+ existing imports. This is simpler and more maintainable for development.
2. **Monorepo workspaces:** Root package.json defines `apps/*` and `packages/*` workspaces, enabling unified dependency management.
3. **Tauri window config:** 1200x800 default, 900x600 minimum, resizable — matches UI-SPEC requirements.
4. **Admin route mounting:** Mounted at `/admin` prefix before health endpoint. Existing root-level routes (GET /config, POST /providers, etc.) preserved for backward compatibility.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag:shell-spawn | src-tauri/capabilities/default.json | Shell spawn/kill permissions granted to main window — mitigated by Tauri capability scoping |
| threat_flag:localhost-binding | src-tauri/src/lib.rs | Proxy health check via localhost:3456 — localhost-only, no network exposure (T-03-01) |

## Known Stubs

- `StatusDot` component uses hardcoded `state="loading"` in SidebarHeader — will be wired to real proxy status in Plan 03
- Placeholder pages (Status, Providers, Mapping, Settings) display "coming soon" text — will be replaced in Plans 03 and 04

## Self-Check: PASSED

- All Tauri files exist: Cargo.toml, build.rs, tauri.conf.json, lib.rs, capabilities/default.json
- Root package.json with workspaces configured
- Admin routes mounted at /admin prefix in Express
- Rust commands: start_proxy, stop_proxy, get_proxy_status implemented and registered
