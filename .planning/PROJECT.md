# Claude Code Proxy

## What This Is

A macOS desktop application (Next.js/React) that acts as a proxy between Claude Code and various AI providers. It maps Claude's native model identifiers (Opus, Sonnet, Haiku) to equivalent models from different providers, enabling cost savings and provider flexibility.

## Core Value

Route Claude Code requests through the provider offering the best quality/cost ratio for each model tier — without changing how the user uses Claude Code.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Multiple provider support (OpenRouter, OpenCode Zen/Go, Ollama, Custom)
- [ ] Model mapping configuration per provider
- [ ] User-facing macOS app with configuration UI
- [ ] Proxy middleware to intercept and route Claude Code traffic
- [ ] Configuration persistence

### Out of Scope

- [iOS/Android mobile] — macOS desktop only for v1
- [Web-based configuration panel] — Native macOS app
- [Real-time model switching] — Static configuration, restart required
- [Built-in model caching] — Pass-through proxy, no local inference

## Context

**Existing reference projects in `reference/`:**
- `claude-code-router/` — Node.js monorepo, multi-provider routing with extensible architecture
- `free-claude-code/` — Python-based proxy with provider abstraction, YAML config

**User's stated mappings:**
```
Opus      → opencode/qwen3.6
Sonnet    → openrouter/mimo-v2-flash
Haiku     → opencode/nvidia/nemotron-3-super-120b-a12b:free
```

**Design system:** Cursor brand (warm cream canvas, Cursor Orange #f54e00 accent, JetBrains Mono for code surfaces) — see `DESIGN.md`

**Key constraint:** Must work seamlessly with Claude Code CLI — user shouldn't notice they're using a proxy.

## Constraints

- **Platform**: macOS desktop application
- **Framework**: Next.js or React (Tauri or Electron for desktop wrapping)
- **Compatibility**: Claude Code CLI must work transparently — no user behavior changes
- **Providers**: OpenRouter, OpenCode, Ollama, Custom (extensible)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| macOS desktop | User's platform, reference implementations cross-platform | — Pending |
| Reference-based | Two working implementations exist | — Pending |
| Cursor design system | User-specified in DESIGN.md | — Pending |
| Fine granularity | User selected fine (8-12 phases) | — Pending |
| Quality model profile | User selected for research/roadmap agents | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-10 after initialization*