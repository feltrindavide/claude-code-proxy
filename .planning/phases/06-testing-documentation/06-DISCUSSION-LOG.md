# Phase 06: Testing & Documentation - Discussion Log

**Date:** 2026-05-11
**Areas discussed:** 4

## E2E Test Strategy

**Question:** Come preferisci testare l'intero flusso proxy?
- Options: Playwright E2E test (raccomandato), Script di integrazione (curl-based), Mock-based integration test
- **Selected:** Playwright E2E test (raccomandato)

**Question:** Quanto deve essere approfondita la copertura E2E?
- Options: Flusso happy-path (raccomandato), Tutti i flussi principali
- **Selected:** Tutti i flussi principali

**Notes:** User wants comprehensive E2E coverage including all main flows from Phase 1-5 (happy path + edge cases: provider unavailable, rate limiting, retry, config export/import).

## Documentation Scope

**Question:** Che tipo di documentazione serve per il primo rilascio?
- Options: README user-facing (raccomandato), README dev + docs/ completa, README minimale
- **Selected:** README dev + docs/ completa

**Question:** In che lingua deve essere la documentazione?
- Options: Inglese (raccomandato), Bilingue EN/IT, Italiano
- **Selected:** Inglese (raccomandato)

**Notes:** Documentation should include README for developers + docs/ directory with architecture, decisions, and API reference. All in English.

## Setup Automation

**Question:** Come preferisci automatizzare il setup iniziale?
- Options: Script CLI setup (raccomandato), Wizard nell'app Tauri, Solo istruzioni manuali
- **Selected:** Script CLI setup (raccomandato)

**Question:** Cosa deve fare lo script di setup?
- Options: Setup base (raccomandato), Setup + diagnostica
- **Selected:** Setup + diagnostica

**Notes:** Setup script should configure ANTHROPIC_BASE_URL, create default config.json, verify provider connections, import config from backup, configure Keychain, and generate diagnostic report.

## Release Packaging

**Question:** Cosa deve includere il pacchetto di rilascio?
- Options: .dmg + setup + docs (raccomandato), Solo .dmg, .dmg + auto-update
- **Selected:** User requested both option 1 and 3 (.dmg + setup + docs + auto-update)

**Notes:** Release package includes .dmg with app, auto-update integrated, setup script, and documentation. Auto-update is part of the Tauri app.

## Deferred Ideas

None — discussion stayed within phase scope.
