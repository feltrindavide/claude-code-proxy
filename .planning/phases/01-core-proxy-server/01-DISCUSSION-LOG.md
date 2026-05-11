# Discussion Log: Phase 1 - Core Proxy Server

**Date:** 2026-05-10
**Phase:** 1 - Core Proxy Server
**Mode:** Default (interactive)

---

## Areas Discussed

### 1. Proxy Server Model

**Question:** "How should the proxy server run?"
**Options presented:**
- Express.js sidecar (Recommended) — Simpler, matches reference projects, easy to debug
- Tauri Rust plugin — Faster, native Rust performance, cleaner integration
- Next.js API routes — Single process, simplest deployment

**User selected:** Express.js sidecar (Recommended)

**Notes:** User chose the recommended option. Express.js sidecar is simpler, matches both reference implementations, and allows easy debugging of the proxy independently from the UI.

---

### 2. Configuration Communication

**Question:** "How should the proxy and UI communicate?"
**Options presented:**
- Localhost HTTP API (Recommended) — Simple REST API, easier to debug
- Tauri commands — Native Tauri IPC, type-safe
- Shared config file — Simple, no server needed

**User selected:** Localhost HTTP API (Recommended)

**Notes:** User chose HTTP API. This keeps the proxy and frontend loosely coupled, and makes it easy to test the proxy independently.

---

### 3. Default Port

**Question:** "What should the default proxy listen port be?"
**Options presented:**
- 3456 (Recommended) — Unlikely to conflict, memorable
- 8080 — Common choice but might conflict
- 8081 — Matches Claude Code convention
- Custom — Let user specify

**User selected:** 3456 (Recommended)

**Notes:** User accepted the recommended default port 3456.

---

### 4. Model Mapping Strategy

**Question:** "How should model mapping work?"
**Options presented:**
- Per-tier (Recommended) — opus→X, sonnet→Y, haiku→Z — simplest for users
- Per-provider — All models from one provider → that provider
- Hybrid — Per-tier default with per-provider overrides (v2)

**User selected:** Per-tier (Recommended)

**Notes:** User chose per-tier mapping, matching their original vision from IDEA.md. This is the simplest UX for Phase 1.

---

### 5. Claude Code Setup

**Question:** "How should users configure Claude Code to use the proxy?"
**Options presented:**
- CLI installer script (Recommended) — One command: `claude-code-proxy setup`
- Manual instructions — Step-by-step guide users follow themselves
- Guided setup wizard — Interactive prompts in the terminal

**User selected:** CLI installer script (Recommended)

**Notes:** User wants a simple setup command. Phase 1 will include a CLI setup command that configures the ANTHROPIC_BASE_URL environment variable.

---

## Summary

All 4 selected areas were discussed and decisions captured:

1. **Proxy model:** Express.js sidecar on port 3456
2. **Communication:** localhost HTTP REST API
3. **Model mapping:** Per-tier (Opus/Sonnet/Haiku → provider/model)
4. **Setup flow:** CLI installer script

## Deferred Ideas

No scope creep detected. All discussion stayed within Phase 1 boundaries.

---

*Discussion completed: 2026-05-10*