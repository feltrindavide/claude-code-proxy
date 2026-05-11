# Phase 3: Desktop UI Shell - Discussion Log

**Date:** 2026-05-10
**Mode:** Default (interactive)

## Discussion Summary

### Area 1: App Shell Architecture

| Question | Options | Selected |
|----------|---------|----------|
| Desktop app integration with Express? | **Tauri + Express sidecar**, Separate processes, Electron | Tauri + Express sidecar |
| Express lifecycle management? | **Tauri manages lifecycle**, Express runs independently | Tauri manages Express lifecycle |

**Decisions captured:** D-29, D-30, D-31, D-32

### Area 2: UI Layout & Navigation

| Question | Options | Selected |
|----------|---------|----------|
| Navigation style? | **Sidebar navigation**, Tab-based, Single-page | Sidebar navigation |
| Phase 3 UI scope? | **Full-featured**, Minimal shell | Full-featured in Phase 3 |

**Decisions captured:** D-33, D-34, D-35

### Area 3: Status Indicator Behavior

| Question | Options | Selected |
|----------|---------|----------|
| Status detection & response? | **Auto-check + auto-start**, Manual start, Polling interval | Auto-check + auto-start |
| Status visibility? | **Sidebar + Status page**, Sidebar only | Sidebar + Status page |

**Decisions captured:** D-36, D-37, D-38, D-39

### Area 4: Keychain Integration from UI

| Question | Options | Selected |
|----------|---------|----------|
| How UI stores API keys in Keychain? | **Via proxy admin API**, Via Tauri Rust commands, Ephemeral | Via proxy admin API |
| Provider form design? | **Full form with test button**, Minimal form, auto-detect | Full form with test button |

**Decisions captured:** D-40, D-41, D-42, D-43

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 3-Desktop UI Shell*
*Discussion completed: 2026-05-10*
