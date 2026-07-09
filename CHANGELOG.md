# Changelog

All notable changes to Claude Code Proxy are documented in this file.

## [0.7.3] - 2026-07-09

### Fixed
- **Model picker (Enterprise org)**: `modelOverrides` maps native Claude IDs (`claude-opus-4-8`, etc.) to upstream targets; tier env vars use org-compatible Claude IDs
- **Status line**: `context-status.js` shows mapped upstream model (e.g. `gemma-4-31b-it`) instead of native Opus/Sonnet labels
- Picker labels use tier-prefixed `*_MODEL_NAME` / `*_MODEL_DESCRIPTION`; disable gateway model discovery to reduce duplicate entries
- Sync `availableModels`, env, and overrides into `~/.claude/settings.json` on route save

## [0.7.2] - 2026-07-09

### Added
- Dedicated **Fable 5** tier in Model Mapping UI (maps to `ANTHROPIC_DEFAULT_FABLE_MODEL`)
- Route resolution for `claude-fable-5` and `fable` model aliases

### Fixed
- **Automode**: boost `max_tokens` for haiku-tier classifier requests (not only DeepSeek)
- **Model picker**: `models.sh` again exports upstream target models and `*_MODEL_NAME` labels instead of hardcoded Claude tier IDs

## [0.7.1] - 2026-07-09

### Fixed
- Tray menu and popup opened dashboard on `:3457` (dev-only); production app now opens `http://localhost:3456` where the bundled UI is served

## [0.7.0] - 2026-07-09

### Added
- Enterprise remediation across proxy core, security, frontend, Tauri, and CI
- GitHub Actions CI: vitest, typecheck (proxy/web/cli), lint, build verify
- Release workflow test gate before Tauri build
- Adapter, SSE, retry, config, auth, session, and E2E mock upstream tests (216+ proxy tests)
- Vitest + React Testing Library for `apps/web`
- Rust unit tests in `src-tauri`
- Per-client rate limiting with HTTP 429
- Config fail-fast with backup on invalid `config.json`
- Session tracker write queue and LRU eviction
- Zod API validation, centralized `configStore`, health polling in AppShell
- Tauri proxy lifecycle: tracked PID cleanup, watchdog restart, health gate post-spawn
- Autostart opt-in, updater plugin wired, `teardown-desktop.sh`
- `POST /admin/providers/validate-dry` for connection test without save

### Security
- LAN bind requires `PROXY_API_TOKEN`; admin API on localhost only
- Replay bodies disabled by default (opt-in encrypted storage)
- Keychain fail-closed; legacy XOR secrets rejected
- Admin bootstrap rate-limited; constant-time token compare
- TLS 1.2+ on HTTPS :8743; extended log redaction
- Removed vulnerable `http-proxy-middleware` dependency

### Fixed
- Rate limiter deadlock (single schedule point)
- DeepSeek `max_tokens` boost before upstream fetch
- Non-streaming timeout via real `stream` flag in adapters
- `adminPortSeparation` static frontend loss
- Custom/OpenCode tool ordering and SSE tool index mapping
- Mid-stream failover between route candidates
- Popup tray auth, WebSocket memory leak, error boundaries
- E2E happy-path provider save verification

## [0.6.2] - 2026-07-04

### Fixed
- Provider and model save validation with clear admin errors
