# Phase 5: Reliability Polish — Discussion Log

**Date:** 2026-05-10
**Areas discussed:** 4

---

## Area 1: Rate Limiting Strategy

| Question | Options | Selected |
|----------|---------|----------|
| How should rate limiting work? | Per-provider req/min, Per-provider tokens/min, Global rate limit | Per-provider requests/minute |
| What happens when limit exceeded? | Queue and delay, Reject with 429, Fallback to next provider | Queue and delay |
| Should rate limits be configurable? | Configurable per provider, Fixed default for all | Configurable per provider (default 60 req/min) |

**Notes:** User wants queued requests to be processed when window resets — no request loss.

---

## Area 2: Automatic Failover Behavior

| Question | Options | Selected |
|----------|---------|----------|
| How to handle provider failures? | Auto-failover to next, Show error no failover, Circuit breaker pattern | Show error, no failover |

**Notes:** User prefers explicit control — no automatic provider switching. Aligns with PROJECT.md out-of-scope ("Real-time model switching — Configuration changes require restart for reliability").

---

## Area 3: Retry with Backoff

| Question | Options | Selected |
|----------|---------|----------|
| Should failed requests be retried? | Retry transient errors only, No retry — fail fast, Retry all errors | Retry transient errors only |
| How to communicate retries? | Log in routing log, Toast notification, Silent | Both log + toast |

**Notes:** Retry only 5xx, network errors, timeouts. Not 4xx. Max 2 retries with 1s then 2s backoff. User explicitly requested "possiamo fare 1 e 2?" — wants both visibility mechanisms.

---

## Area 4: Startup Validation UI

| Question | Options | Selected |
|----------|---------|----------|
| How to show validation warnings? | Warning badges on providers, Single banner on Status, Toast on launch | Warning badges on providers |
| Should Status page show health? | Provider Health card, No Status page changes | Provider Health card on Status page |

**Notes:** Warnings persist until user fixes or dismisses. ProviderValidatorService (Phase 2) reused — only UI integration is new.

---

## Decisions Captured

D-59 through D-73 (15 decisions total)

## Deferred Ideas

- RELY-01 (Automatic failover) — Explicitly deferred, user prefers manual control
- RELY-03 (Retry with exponential backoff) — Partially implemented in this phase

---

*Discussion completed: 2026-05-10*
