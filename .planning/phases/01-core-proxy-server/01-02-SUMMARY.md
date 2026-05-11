---
phase: 01-core-proxy-server
plan: 02
subsystem: proxy-server
tags: [config, keychain, admin-api, security]
dependency_graph:
  requires: []
  provides: [ConfigService, KeychainService, AdminAPI]
  affects: [proxy.ts]
tech_stack:
  added: [keytar, zod]
  patterns: [singleton-services, keychain-credential-store]
key_files:
  created:
    - packages/proxy/src/services/config.ts
    - packages/proxy/src/services/keychain.ts
    - packages/proxy/src/services/provider.ts
    - packages/proxy/src/routes/admin.ts
    - packages/proxy/src/proxy.ts
    - packages/proxy/src/index.ts
decisions:
  - API keys stored in macOS Keychain (keytar), not config files
  - Config at ~/.claude-code-proxy/config.json
  - Admin endpoints at /admin/* prefix
metrics:
  duration: ~3 minutes
  completed: 2026-05-10T19:17:09Z
  tasks: 3/3
---

# Phase 01 Plan 02: Config Service + Keychain + Admin API Summary

## One-liner
ConfigService with JSON persistence, KeychainService via keytar for secure API key storage, and admin REST API for provider/route management.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|-------|-------|
| 1 | ConfigService | e9ee14e | config.ts, config.test.ts |
| 2 | KeychainService | e9ee14e | keychain.ts, keychain.test.ts |
| 3 | Admin API | e9ee14e | admin.ts, admin.test.ts |

## What Was Built

### ConfigService (`packages/proxy/src/services/config.ts`)
- JSON persistence at `~/.claude-code-proxy/config.json`
- `load()`: reads config, returns defaults if not exists
- `save()`: atomic write (temp file + rename)
- `getDefaults()`: default routes per D-07
  - opus → opencode/qwen3.6
  - sonnet → openrouter/mimo-v2-flash
  - haiku → opencode/nemotron-3-super-120b-a12b:free
- zod validation schemas for input validation (ASVS V5)

### KeychainService (`packages/proxy/src/services/keychain.ts`)
- Wraps keytar npm for macOS Keychain
- `setKey()`: store API key by provider name
- `getKey()`: retrieve API key
- `deleteKey()`: remove API key
- `hasKey()`: check if key exists
- `maskKey()`: AUTH-03 - masks as `sk-an...2345` format

### Admin API (`packages/proxy/src/routes/admin.ts`)
- `GET /admin/config` → return config
- `PUT /admin/config` → save config
- `GET /admin/providers` → list providers (keys masked)
- `POST /admin/providers` → add provider, store key in Keychain
- `DELETE /admin/providers/:id` → remove provider + Keychain entry
- `GET /admin/routes` → list routes
- `PUT /admin/routes` → update routes

### ProviderService (`packages/proxy/src/services/provider.ts`)
- Registry for providers
- Route resolution by tier prefix matching
- `claude-opus-*` → opus tier
- `claude-sonnet-*` → sonnet tier
- `claude-haiku-*` → haiku tier

## Deviation Documentation

### Auto-Fixed Issues

None - plan executed exactly as written.

### Known Stubs

None.

## Threat Model Compliance

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-01-06 (config tampering) | Only keyId stored in config, zod validation | ✓ |
| T-01-07 (Keychain credential leaks) | Keys never in config/logs | ✓ |
| T-01-08 (Keychain permission errors) | Error wrapping | ✓ |
| T-01-09 (admin API auth bypass) | Localhost only (D-04) | ✓ |

## Test Results

```
Test Files  5 passed (5)
Tests     29 passed (29)
```

All tests pass.

## Requirements Coverage

| Req | Status |
|-----|--------|
| AUTH-01 | ✓ Configured via admin API |
| AUTH-02 | ✓ Stored in macOS Keychain |
| AUTH-03 | ✓ maskKey() returns first 4 + last 4 |
| PROV-01 | ✓ CRUD for providers |
| PROV-02 | ✓ Enabled/disabled toggle |
| MAP-03 | ✓ Config persists to config.json |

## Self-Check

- [x] All files created
- [x] Commit verified (e9ee14e)
- [x] Tests pass (29/29)
- [x] Types compile without errors