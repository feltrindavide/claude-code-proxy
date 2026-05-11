---
phase: "03"
plan: "04"
subsystem: frontend
tags: [provider-crud, model-mapping, settings, toast, modal]
dependency:
  requires: ["03-02"]
  provides: ["provider management UI", "model mapping UI", "settings UI", "toast notifications", "modal dialogs"]
  affects: ["providers/page.tsx", "mapping/page.tsx", "settings/page.tsx", "layout.tsx"]
tech-stack:
  added: ["Toast notification system", "Modal dialog component"]
  patterns: ["Modal with Escape/overlay close", "Toast with 3s auto-dismiss", "Provider CRUD with Test Connection"]
key-files:
  created:
    - apps/web/src/components/Toast.tsx
    - apps/web/src/components/Modal.tsx
    - apps/web/src/components/ProviderList.tsx
    - apps/web/src/components/ProviderForm.tsx
    - apps/web/src/components/ModelMappingForm.tsx
    - apps/web/src/components/SettingsForm.tsx
  modified:
    - apps/web/src/lib/api.ts
    - apps/web/src/app/providers/page.tsx
    - apps/web/src/app/mapping/page.tsx
    - apps/web/src/app/settings/page.tsx
    - apps/web/src/app/layout.tsx
decisions:
  - "ToastContainer placed in root layout.tsx for global availability (not per-page)"
  - "ProviderForm saves new provider before Test Connection (provider must exist for validation endpoint)"
  - "Model mapping defaults to Phase 1 mappings (opus→opencode/qwen3.6, sonnet→openrouter/mimo-v2-flash, haiku→opencode/nvidia)"
  - "SettingsForm Keychain status assumed available (no dedicated API endpoint yet)"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-10T22:35:00Z"
---

# Phase 03 Plan 04: Provider Forms + Model Mapping + Settings Summary

**One-liner:** Full provider CRUD UI with modal form + Test Connection, 3-tier model mapping configuration, settings page with port/auto-start/keychain status, global toast notifications, and modal dialog system.

---

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Toast + Modal + API extensions | `92b07958` | `Toast.tsx`, `Modal.tsx`, `api.ts` (extended) |
| 2 | Providers page + CRUD | `8704dbba` | `ProviderList.tsx`, `ProviderForm.tsx` |
| 3 | Model Mapping + Settings | `8d237ec4` | `ModelMappingForm.tsx`, `SettingsForm.tsx` |

## Task Details

### Task 1: Toast, Modal, and API Extensions
- `Toast.tsx`: `useToast()` hook with global state, `ToastContainer` component, auto-dismiss after 3s, success/error variants with icons, manual dismiss button
- `Modal.tsx`: Overlay with `bg-black/40`, centered card, Escape key close, overlay click close, aria-modal
- `api.ts` extended with: `fetchProviders()`, `saveProvider()`, `deleteProvider()`, `testProviderConnection()`, `fetchRoutes()`, `saveRoutes()`, `fetchConfig()`
- `layout.tsx`: Added `<ToastContainer />` after `<AppShell>` for global notifications

### Task 2: Providers Page
- `ProviderList.tsx`: List view with provider name, base URL, enabled badge, edit/delete buttons. Empty state with "No providers configured" heading. Delete confirmation modal with Keychain warning.
- `ProviderForm.tsx`: 6 fields (name, baseUrl, apiKey/password, providerType dropdown, enabled toggle, priority number). Validation: name required, baseUrl valid URL, apiKey required for new providers. Test Connection button with loading/success/error states.
- `providers/page.tsx`: Renders `<ProviderList />` (ToastContainer is global in layout)

### Task 3: Model Mapping and Settings
- `ModelMappingForm.tsx`: 3 tier rows (Opus/Sonnet/Haiku), provider dropdowns populated from API, model inputs with monospace font, Save Mappings button with loading state, defaults to Phase 1 mappings
- `SettingsForm.tsx`: Proxy port input, auto-start toggle, health check interval (read-only "5 seconds (fixed)"), Keychain status with Shield icon, About section with "ClaudeCode Proxy v0.1.0"
- `mapping/page.tsx`: Renders `<ModelMappingForm />`
- `settings/page.tsx`: Renders `<SettingsForm />`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] ToastContainer not per-page but global**
- **Found during:** Task 3
- **Issue:** Plan specified ToastContainer on each page, but layout.tsx is better for global availability
- **Fix:** Added ToastContainer to root layout.tsx, removed per-page ToastContainer imports
- **Files modified:** `layout.tsx`, `providers/page.tsx`, `mapping/page.tsx`, `settings/page.tsx`

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| SettingsForm `handleSave()` shows toast but doesn't persist | `SettingsForm.tsx` | No backend endpoint for settings persistence yet (port, auto-start) |
| Keychain status hardcoded to `true` | `SettingsForm.tsx` | No dedicated API endpoint to check Keychain availability |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag:info_disclosure | `ProviderForm.tsx` | API key visible in DOM during input — mitigated by password input type (T-03-10) |
| threat_flag:tampering | `ModelMappingForm.tsx` | Client-side route editing — backend validates claudeTier enum (T-03-11) |

## Self-Check: PASSED

All created files verified:
- `apps/web/src/components/Toast.tsx` ✅
- `apps/web/src/components/Modal.tsx` ✅
- `apps/web/src/components/ProviderList.tsx` ✅
- `apps/web/src/components/ProviderForm.tsx` ✅
- `apps/web/src/components/ModelMappingForm.tsx` ✅
- `apps/web/src/components/SettingsForm.tsx` ✅
- `apps/web/src/lib/api.ts` (extended) ✅
- `apps/web/src/app/providers/page.tsx` (modified) ✅
- `apps/web/src/app/mapping/page.tsx` (modified) ✅
- `apps/web/src/app/settings/page.tsx` (modified) ✅
- `apps/web/src/app/layout.tsx` (modified) ✅
