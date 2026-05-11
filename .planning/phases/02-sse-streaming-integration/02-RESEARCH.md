# Phase 2: SSE Streaming & Integration - Research

**Researched:** 2026-05-10
**Domain:** SSE streaming, provider API format transformation, adapter patterns
**Confidence:** HIGH

## Summary

This phase replaces the current `http-proxy-middleware` passthrough (`selfHandleResponse: false`) with a custom request/response handler that intercepts upstream provider responses, transforms them to Anthropic-compatible SSE format, and streams them back to Claude Code. The proxy must be invisible to Claude Code — every response must look like it came from the Anthropic API.

The critical technical challenge is that providers use incompatible SSE formats: Anthropic-style (`event: message_start`, `event: content_block_delta`, etc.) vs OpenAI-style (`data: {json}\n\n` with no event names). Some providers (OpenRouter, Ollama) support native Anthropic messages endpoints, simplifying transformation. Others (OpenCode Zen/Go, generic OpenAI-compatible) require full bidirectional format conversion.

**Primary recommendation:** Implement provider-specific adapters implementing a `ProviderAdapter` interface with `transformRequest()`, `transformResponse()`, and `validate()` methods. Adapters live in `packages/proxy/src/adapters/`. The proxy handler resolves the adapter per-request based on the provider type, transforms the request body, makes the upstream call, intercepts the SSE stream, and emits Anthropic-format events to Claude Code.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SSE format transformation | API / Backend | — | Happens in proxy server between upstream and Claude Code |
| Request body transformation | API / Backend | — | Anthropic → provider format before upstream call |
| Response SSE transformation | API / Backend | — | Provider SSE → Anthropic SSE before forwarding |
| Provider validation | API / Backend | — | Connectivity checks run from proxy server |
| Error format transformation | API / Backend | — | Provider errors → Anthropic error format |
| Timeout management | API / Backend | — | HTTP client timeouts configured per adapter |
| Model routing | API / Backend | — | ProviderService resolves tier → provider (Phase 1) |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-15:** Provider-specific adapters for each provider type (OpenRouter, OpenCode, Ollama, Custom) — not a generic transformer
- **D-16:** Bidirectional transforms: each adapter implements `transformRequest()` (Anthropic → provider format) and `transformResponse()` (provider → Anthropic format)
- **D-17:** Adapters live in `packages/proxy/src/adapters/{provider}.ts`
- **D-18:** Interface-based design: `ProviderAdapter` interface with `transformRequest()` and `transformResponse()` methods
- **D-19:** Custom SSE handler — intercept upstream SSE stream, detect format, transform events to Anthropic-style events (`message_start`, `content_block_delta`, `text_delta`, `message_stop`) before forwarding to Claude Code
- **D-20:** SSE transformation happens in the adapter's `transformResponse()` method — consistent with the adapter pattern
- **D-21:** Timeout strategy: 120s for streaming connections, 30s for non-streaming, configurable per-provider
- **D-22:** Validate on save (when adding/editing a provider via admin API) AND on proxy startup
- **D-23:** Each adapter implements its own `validate()` method — per-adapter validation logic
- **D-24:** Default validation approach: `GET /v1/models`, with per-adapter fallback if the provider doesn't support it
- **D-25:** User noted: OpenRouter and OpenCode Zen/Go may require `POST /v1/chat/completions` — adapters must handle this
- **D-26:** All upstream errors transformed to Anthropic-compatible error format (`{type: 'error', error: {type, message}}`) so Claude Code understands them natively
- **D-27:** Error transformation happens in the adapter's `transformResponse()` — consistent with the adapter pattern
- **D-28:** Log error details internally (without API keys), return user-friendly Anthropic-format error to Claude Code

### the agent's Discretion
- Specific SSE event mapping details (which OpenAI events map to which Anthropic events) — researcher to determine
- Exact validation endpoint per provider — adapters decide based on provider capabilities
- Error message content — balance between useful debugging info and not exposing provider internals

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `eventsource-parser` | 3.0.8 | SSE text stream → event objects | [VERIFIED: npm registry] Lightweight SSE parser, handles both `event:` and `data:` lines, used by Vercel AI SDK |
| `undici` | 7.x (bundled with Node 22+) | HTTP fetch with streaming | [VERIFIED: npm registry] Node.js built-in `fetch` with proper `ReadableStream` support for SSE — no extra dependency needed for Node 20+ |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.x (existing) | Request/response validation | Already in project — validate transformed payloads |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `undici`/built-in `fetch` | `node-fetch` | `node-fetch` is ESM-only maintenance mode; built-in `fetch` is standard in Node 20+ |
| `eventsource-parser` | Manual SSE line parsing | Manual parsing misses edge cases (multi-line data, BOM, encoding) |
| `http-proxy-middleware` onProxyRes | Full custom handler | `onProxyRes` doesn't give streaming control; need full request handler for SSE transformation |

**Installation:**
```bash
npm install eventsource-parser
```

**Version verification:**
```
eventsource-parser: 3.0.8 (published 2025-03-15) [VERIFIED: npm registry]
undici: bundled with Node.js 20+ [VERIFIED: Node.js docs]
```

## Architecture Patterns

### System Architecture Diagram

```
Claude Code
    │
    │  POST /v1/messages (Anthropic format)
    │  Content-Type: application/json
    │  Accept: text/event-stream
    ▼
┌─────────────────────────────────────────────────┐
│              Proxy Server (Express)              │
│                                                  │
│  1. Parse Anthropic request body                 │
│  2. Resolve model tier → provider (ProviderSvc)  │
│  3. Select adapter by provider type              │
│  4. adapter.transformRequest()                   │
│     Anthropic body → Provider body               │
│  5. Fetch API key from KeychainService           │
│  6. POST to upstream provider                    │
│  7. Intercept SSE response stream                │
│  8. adapter.transformResponse()                  │
│     Provider SSE → Anthropic SSE                 │
│  9. Stream Anthropic SSE to Claude Code          │
│                                                  │
│  On error: emit Anthropic error SSE events       │
└─────────────────────────────────────────────────┘
    │
    │  event: message_start
    │  event: content_block_delta (text_delta)
    │  event: content_block_delta (input_json_delta)
    │  event: message_stop
    ▼
Claude Code (sees Anthropic API)
```

### Recommended Project Structure
```
packages/proxy/src/
├── adapters/                    # Provider adapters (D-17)
│   ├── index.ts                 # Adapter registry + factory
│   ├── interface.ts             # ProviderAdapter interface (D-18)
│   ├── openrouter.ts            # OpenRouter adapter (native Anthropic API)
│   ├── opencode.ts              # OpenCode Zen/Go adapter (OpenAI-compatible)
│   ├── ollama.ts                # Ollama adapter (native Anthropic or OpenAI)
│   └── custom.ts                # Generic OpenAI-compatible adapter
├── services/
│   ├── sse-transformer.ts       # SSE event transformation utilities
│   └── provider-validator.ts    # Provider connectivity validation
├── proxy.ts                     # Custom proxy handler (replaces http-proxy-middleware passthrough)
├── types/
│   └── index.ts                 # Extended with adapter types
└── routes/
    └── admin.ts                 # Extended with validation endpoint (D-22)
```

### Pattern 1: ProviderAdapter Interface

**What:** Interface-based adapter pattern with bidirectional transforms

```typescript
// packages/proxy/src/adapters/interface.ts
import type { Readable } from 'node:stream';

export interface ProviderAdapter {
  /** Provider type identifier (e.g., 'openrouter', 'ollama') */
  readonly providerType: string;

  /** Transform Anthropic-format request to provider format */
  transformRequest(
    anthropicBody: AnthropicMessagesBody,
    route: RouteResolution,
  ): ProviderRequestBody;

  /** Transform provider SSE stream to Anthropic SSE stream */
  transformResponse(
    upstreamResponse: Response,
    options: TransformOptions,
  ): AsyncIterable<string>;

  /** Validate provider connectivity */
  validate(baseUrl: string, apiKey: string): Promise<ValidationResult>;

  /** Per-provider timeout config (ms) */
  timeouts: {
    streaming: number;   // default 120000
    nonStreaming: number; // default 30000
  };
}

export interface TransformOptions {
  messageId: string;
  model: string;
  inputTokens: number;
  requestId?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  models?: string[];
}
```

### Pattern 2: SSE Event Transformation

**What:** Transform OpenAI-style SSE chunks into Anthropic-style SSE events

The OpenAI streaming format emits `data: {json}\n\n` per chunk. Each chunk contains:
- `choices[0].delta.content` → text content
- `choices[0].delta.tool_calls` → tool call deltas
- `choices[0].finish_reason` → stream termination

These map to Anthropic events:

| OpenAI SSE Chunk Field | Anthropic SSE Event | Delta Type |
|------------------------|---------------------|------------|
| First chunk (no delta) | `message_start` | — |
| `delta.content` (first) | `content_block_start` (text) + `content_block_delta` | `text_delta` |
| `delta.content` (subsequent) | `content_block_delta` | `text_delta` |
| `delta.tool_calls[].id` (first) | `content_block_start` (tool_use) | — |
| `delta.tool_calls[].function.arguments` | `content_block_delta` | `input_json_delta` |
| `finish_reason: "stop"` | `message_delta` + `message_stop` | — |
| `finish_reason: "length"` | `message_delta` (stop_reason: "max_tokens") + `message_stop` | — |
| `finish_reason: "tool_calls"` | `message_delta` (stop_reason: "tool_use") + `message_stop` | — |
| Error response body | `error` event OR text block with error | — |

**Anthropic SSE event sequence (complete stream):**
```
event: message_start
data: {"type":"message_start","message":{"id":"msg_xxx","type":"message","role":"assistant","content":[],"model":"...","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":N,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":N,"output_tokens":M}}

event: message_stop
data: {"type":"message_stop"}
```

### Pattern 3: Custom Proxy Handler (replacing http-proxy-middleware passthrough)

**What:** Replace `selfHandleResponse: false` with a full Express route handler that makes upstream requests and transforms SSE responses.

```typescript
// packages/proxy/src/proxy.ts — replacement pattern
import type { Request, Response } from 'express';
import { getAdapter } from './adapters/index.js';
import { providerService } from './services/provider.js';
import { keychainService } from './services/keychain.js';

export async function handleProxyRequest(req: Request, res: Response) {
  // 1. Parse model from request body
  const body = req.body;
  const modelName = body.model || 'claude-opus-4-20250514';

  // 2. Resolve route
  const resolution = providerService.resolveModelRoute(modelName);
  if (!resolution) {
    return emitAnthropicError(res, 'No route configured for model: ' + modelName);
  }

  // 3. Get API key
  const apiKey = await keychainService.getKey(resolution.provider.name);
  if (!apiKey) {
    return emitAnthropicError(res, 'API key not found for provider: ' + resolution.provider.name);
  }

  // 4. Select adapter
  const adapter = getAdapter(resolution.provider.name, resolution.provider.baseUrl);

  // 5. Transform request
  const providerBody = adapter.transformRequest(body, resolution);

  // 6. Make upstream request with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), adapter.timeouts.streaming);

  try {
    const upstreamResponse = await fetch(`${resolution.provider.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(providerBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // 7. Transform and stream response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    for await (const event of adapter.transformResponse(upstreamResponse, {
      messageId: `msg_${crypto.randomUUID()}`,
      model: body.model,
      inputTokens: 0, // Will be computed from request
    })) {
      res.write(event);
    }
    res.end();
  } catch (error) {
    clearTimeout(timeout);
    emitAnthropicError(res, error);
  }
}
```

### Anti-Patterns to Avoid

- **Passthrough with onProxyRes transformation:** `http-proxy-middleware`'s `onProxyRes` callback receives the full response buffer, not a stream. For SSE streaming, you need full control of the response stream — use a custom handler instead.
- **Generic transformer for all providers:** A single transformer trying to handle all provider formats becomes unmaintainable. Provider-specific adapters (D-15) keep complexity localized.
- **Buffering full response before transformation:** SSE must be streamed token-by-token. Buffering defeats the purpose of streaming and causes Claude Code to show no output until the full response is ready.
- **Not handling `[DONE]` terminal events:** OpenAI streams end with `data: [DONE]\n\n`. This must be detected and converted to Anthropic `message_stop`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Manual `line.split(':')` logic | `eventsource-parser` | Handles edge cases: multi-line `data:` fields, BOM characters, empty lines, `\r\n` vs `\n` |
| HTTP streaming | `http.request()` with manual chunk handling | Built-in `fetch()` with `response.body` (ReadableStream) | Node 20+ has native streaming fetch; simpler API, proper backpressure |
| UUID generation | `Math.random().toString()` | `crypto.randomUUID()` | Built-in, cryptographically sound, no dependency |
| Error formatting | String concatenation | SSEBuilder pattern (from reference) | Anthropic error format has specific structure; reference implementation handles all edge cases |

**Key insight:** SSE parsing looks trivial until you encounter multi-line data fields, providers that emit `[DONE]` as an event vs data, or streams that terminate without proper closing events. The `eventsource-parser` library handles all these edge cases and is only 3KB.

## Runtime State Inventory

> Not applicable — this is a greenfield phase adding new functionality, not a rename/refactor/migration.

## Common Pitfalls

### Pitfall 1: SSE Event Ordering Violations
**What goes wrong:** Anthropic SSE has strict ordering: `message_start` → `content_block_start` → `content_block_delta` × N → `content_block_stop` → `message_delta` → `message_stop`. OpenAI streams don't guarantee this ordering — chunks may arrive out of order or with missing events.
**Why it happens:** OpenAI sends flat chunks with no explicit block lifecycle. The proxy must synthesize block start/stop events.
**How to avoid:** Implement a `ContentBlockManager` (from reference `sse.py`) that tracks open blocks, allocates indices, and synthesizes missing start/stop events.
**Warning signs:** Claude Code hangs after first token, or shows garbled output.

### Pitfall 2: Tool Call Argument Fragmentation
**What goes wrong:** OpenAI streams tool call arguments as JSON fragments across multiple chunks (`{"` + `"command":` + `"ls"}` + `}`). These must be emitted as `input_json_delta` events, not as complete JSON.
**Why it happens:** Claude Code expects incremental JSON parsing. Emitting complete JSON per chunk breaks Claude Code's tool parser.
**How to avoid:** Stream tool arguments as raw fragments via `input_json_delta`. The reference implementation (`openai_compat.py` `_emit_tool_arg_delta`) handles this with buffer management for the `Task` tool.
**Warning signs:** Tool calls fail silently, model responds without using tools.

### Pitfall 3: Missing `message_start` with Usage Counters
**What goes wrong:** The `message_start` event must include `usage: {input_tokens, output_tokens}`. If omitted or set incorrectly, Claude Code may misbehave.
**Why it happens:** OpenAI provides `usage` only in the final chunk, not at stream start. The proxy must estimate or defer.
**How to avoid:** Set `output_tokens: 1` in `message_start` (placeholder), then emit accurate counts in `message_delta`. The reference implementation does this (`sse.py` line 200-201).
**Warning signs:** Token counts are wrong in Claude Code, or stream fails to start.

### Pitfall 4: Provider Sends Anthropic Format Already
**What goes wrong:** OpenRouter supports the native Anthropic messages API (`POST /v1/messages` with `anthropic-version` header). If the adapter transforms an already-Anthropic-format response, it double-transforms and corrupts the stream.
**Why it happens:** Not detecting that the provider already emits Anthropic-style events.
**How to avoid:** OpenRouter adapter should use native Anthropic endpoint and pass through events with minimal transformation (filtering terminal noise like `[DONE]`). The reference `OpenRouterProvider` does this — it uses `AnthropicMessagesTransport` base class.
**Warning signs:** Double `message_start` events, corrupted content blocks.

### Pitfall 5: Timeout on Long-Running Streams
**What goes wrong:** Default HTTP timeout (30s) kills streaming responses mid-generation. LLM responses can take 60-120s for long outputs.
**Why it happens:** Node.js `fetch` has no default timeout but the underlying socket may have one. Some providers have idle timeouts.
**How to avoid:** Use `AbortController` with per-provider timeout (D-21: 120s streaming, 30s non-streaming). The reference implementation uses `httpx.Timeout(connect=10, read=300, write=10)`.
**Warning signs:** Streams consistently fail at ~30s, "request timed out" errors.

### Pitfall 6: Error Events Mid-Stream
**What goes wrong:** If an error occurs after streaming has started (e.g., upstream disconnects), the proxy must close open content blocks before emitting the error. Emitting a raw error event without closing blocks breaks Claude Code's parser.
**Why it happens:** Not tracking which content blocks are open when an error occurs.
**How to avoid:** Use `SSEBuilder.close_all_blocks()` pattern from reference before emitting error. The reference `provider_stream_error.py` handles this with `sent_any_event` flag.
**Warning signs:** Claude Code shows partial response then hangs, or shows cryptic error.

## Code Examples

### SSE Parser Setup (eventsource-parser)

```typescript
// packages/proxy/src/services/sse-transformer.ts
import { createParser } from 'eventsource-parser';
import type { ParsedEvent } from 'eventsource-parser';

export function parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncIterable<ParsedEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return {
    async *[Symbol.asyncIterator]() {
      const parser = createParser({
        onEvent: (event) => yield event,
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Feed remaining buffer
          if (buffer.trim()) {
            parser.feed(buffer);
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        parser.feed(buffer);
        buffer = '';
      }
    },
  };
}
```

### OpenAI → Anthropic SSE Transformation (simplified)

```typescript
// packages/proxy/src/adapters/opencode.ts
import type { ProviderAdapter, TransformOptions, ValidationResult } from './interface.js';
import { SSEBuilder } from '../services/sse-builder.js';

export class OpenCodeAdapter implements ProviderAdapter {
  readonly providerType = 'opencode';
  timeouts = { streaming: 120_000, nonStreaming: 30_000 };

  transformRequest(body: any, route: any) {
    // Anthropic messages → OpenAI chat/completions format
    const messages = body.messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: typeof msg.content === 'string'
        ? msg.content
        : msg.content.map((b: any) => b.text).join('\n'),
    }));

    return {
      model: route.targetModel,
      messages,
      stream: true,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      tools: body.tools?.map((t: any) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema, // Anthropic input_schema → OpenAI parameters
        },
      })),
    };
  }

  async *transformResponse(
    upstreamResponse: Response,
    options: TransformOptions,
  ): AsyncIterable<string> {
    const sse = new SSEBuilder(options.messageId, options.model, options.inputTokens);
    yield sse.message_start();

    const text = await upstreamResponse.text();
    // Parse SSE lines
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const chunk = JSON.parse(data);
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (delta?.content) {
          yield sse.ensure_text_block();
          yield sse.emit_text_delta(delta.content);
        }

        if (choice.finish_reason) {
          yield sse.close_content_blocks();
          yield sse.message_delta(mapStopReason(choice.finish_reason), 0);
          yield sse.message_stop();
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  async validate(baseUrl: string, apiKey: string): Promise<ValidationResult> {
    try {
      // Try GET /v1/models first
      const resp = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return { valid: true, models: data.data?.map((m: any) => m.id) };
      }
      // Fallback: POST /v1/chat/completions with minimal request
      const testResp = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
        signal: AbortSignal.timeout(10_000),
      });
      if (testResp.ok || testResp.status === 400) {
        // 400 means "test" model not found — but endpoint works
        return { valid: true };
      }
      return { valid: false, error: `Validation failed: ${testResp.status}` };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
```

### Anthropic Error Format Emission

```typescript
// packages/proxy/src/services/sse-builder.ts
export class SSEBuilder {
  // ... (message_start, content_block_start, etc.)

  emitTopLevelError(errorMessage: string): string {
    return formatSSEEvent('error', {
      type: 'error',
      error: {
        type: 'api_error',
        message: errorMessage,
      },
    });
  }

  emitError(errorMessage: string): string {
    // Emit as text block (for errors mid-stream)
    const index = this.allocateIndex();
    return [
      this.content_block_start(index, 'text'),
      this.content_block_delta(index, 'text_delta', errorMessage),
      this.content_block_stop(index),
    ].join('');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `http-proxy-middleware` passthrough | Custom handler with `fetch()` + streaming | This phase | Enables format transformation |
| Manual SSE line splitting | `eventsource-parser` library | 2024+ | Handles edge cases correctly |
| Single transformer for all providers | Provider-specific adapters | Reference implementations | Per-provider control, extensibility |
| No validation | Connectivity validation on save + startup | This phase | Catches misconfiguration early |

**Deprecated/outdated:**
- `node-fetch`: In maintenance mode. Use built-in `fetch()` in Node 20+.
- `eventsource` package (client-side SSE): Not needed — we're building a server-side SSE producer, not a consumer.
- `http-proxy-middleware` `onProxyRes` for SSE: Doesn't support streaming transformation.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenCode Zen/Go uses OpenAI-compatible `/v1/chat/completions` endpoint | Provider API Formats, Code Examples | [ASSUMED] Based on "OpenAI-compatible" naming convention; if it uses a different format, the adapter needs adjustment |
| A2 | Node.js 20+ is available in the runtime environment | Standard Stack | [ASSUMED] Built-in `fetch()` requires Node 20+; if older Node is used, need `node-fetch` or `undici` |
| A3 | Ollama supports native Anthropic messages API at `/v1/messages` | Provider API Formats | [ASSUMED] Based on reference implementation (`ollama/client.py` sends to `/v1/messages`); Ollama 4.x+ added this, older versions may not support it |
| A4 | `eventsource-parser` works in Node.js (not just browser) | Standard Stack | [ASSUMED] Library is framework-agnostic but primarily tested in browser/Vercel contexts |

## Open Questions (RESOLVED)

1. **OpenCode Zen/Go API format confirmation** — **RESOLVED:** Assume OpenAI-compatible `/v1/chat/completions` format. The adapter will implement OpenAI format with a fallback path if the API differs. This is the most common format for custom providers and aligns with the user's provider list.

2. **Content block transformation depth for Phase 2** — **RESOLVED:** Phase 2 handles basic text streaming and SSE format transformation. Tool call transformation is deferred to Phase 3 (per Pitfall #2 mapping). The `ProviderAdapter` interface is designed with `transformRequest()` and `transformResponse()` methods that will support tool transforms when Phase 3 implements them.

3. **OpenRouter native vs OpenAI endpoint selection** — **RESOLVED:** Prefer native Anthropic endpoint (`POST /v1/messages` with `anthropic-version` header) — less transformation needed, fewer edge cases. Fall back to OpenAI endpoint (`POST /v1/chat/completions`) only if the model doesn't support the Anthropic endpoint. The OpenRouter adapter will implement this preference logic.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Proxy runtime | ✓ | Check with `node --version` (need 20+) | Use `undici` package if Node < 20 |
| `eventsource-parser` | SSE parsing | ✗ (not installed) | 3.0.8 | Manual SSE parsing (high risk) |
| `fetch()` (built-in) | HTTP requests | ✓ (Node 20+) | Bundled | `undici` or `node-fetch` |
| `crypto.randomUUID()` | Message IDs | ✓ (Node 19+) | Bundled | `uuid` package |

**Missing dependencies with fallback:**
- `eventsource-parser` — not yet installed; manual SSE parsing is possible but error-prone (Pitfall #1)

## Validation Architecture

> Nyquist validation is enabled (workflow.nyquist_validation not set to false in config).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing from Phase 1) |
| Config file | `packages/proxy/vitest.config.ts` (Phase 1) |
| Quick run command | `npx vitest run --reporter=dot` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROV-03 | Provider connectivity validation on save | unit | `npx vitest run -t "validate"` | ❌ Wave 0 |
| PROX-04 | Request/response format transformation | unit | `npx vitest run -t "transform"` | ❌ Wave 0 |
| PROX-05 | Graceful error handling with user-friendly messages | unit | `npx vitest run -t "error"` | ❌ Wave 0 |
| INTG-03 | Claude Code works transparently through proxy | integration | `npx vitest run -t "integration"` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `packages/proxy/src/adapters/__tests__/openrouter.test.ts` — covers PROX-04
- [ ] `packages/proxy/src/adapters/__tests__/opencode.test.ts` — covers PROX-04
- [ ] `packages/proxy/src/adapters/__tests__/ollama.test.ts` — covers PROX-04
- [ ] `packages/proxy/src/services/__tests__/sse-transformer.test.ts` — covers PROX-04, PROX-05
- [ ] `packages/proxy/src/services/__tests__/provider-validator.test.ts` — covers PROV-03
- [ ] `packages/proxy/src/__tests__/proxy-streaming.test.ts` — covers INTG-03
- [ ] Shared test fixtures: mock SSE streams (OpenAI format, Anthropic format, error responses)

## Security Domain

> Security enforcement is enabled (not explicitly disabled in config).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer token in Authorization header (API key from Keychain) |
| V3 Session Management | no | Stateless proxy — no sessions |
| V4 Access Control | no | Localhost-only, no external access |
| V5 Input Validation | yes | zod schemas for transformed request/response bodies |
| V6 Cryptography | no | HTTPS to upstream providers (existing) |

### Known Threat Patterns for LLM Proxy

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage in error logs | Information Disclosure | Sanitize error messages, never log keys (existing KeychainService pattern) |
| Request body injection via transform | Tampering | Validate transformed bodies with zod schemas before upstream call |
| SSE injection via upstream response | Tampering | Parse SSE with `eventsource-parser`, don't blindly forward raw text |
| Timeout DoS via slow upstream | Denial of Service | AbortController with per-provider timeout (D-21) |
| Provider impersonation | Spoofing | Validate provider baseUrl against configured providers |

## Sources

### Primary (HIGH confidence)
- Reference: `reference/free-claude-code/core/anthropic/sse.py` — SSEBuilder class, complete Anthropic SSE event generation [CITED: codebase]
- Reference: `reference/free-claude-code/core/anthropic/stream_contracts.py` — Anthropic SSE contract validation [CITED: codebase]
- Reference: `reference/free-claude-code/core/anthropic/native_sse_block_policy.py` — Native SSE block transformation with index remapping [CITED: codebase]
- Reference: `reference/free-claude-code/core/anthropic/provider_stream_error.py` — Canonical error SSE sequence [CITED: codebase]
- Reference: `reference/free-claude-code/providers/open_router/client.py` — OpenRouter native Anthropic adapter [CITED: codebase]
- Reference: `reference/free-claude-code/providers/anthropic_messages.py` — Base transport for native Anthropic providers [CITED: codebase]
- Reference: `reference/free-claude-code/providers/openai_compat.py` — OpenAI → Anthropic streaming transformation [CITED: codebase]
- Reference: `reference/free-claude-code/providers/error_mapping.py` — Error mapping from HTTP/OpenAI exceptions [CITED: codebase]
- Reference: `reference/free-claude-code/core/anthropic/errors.py` — User-facing error message formatting [CITED: codebase]
- npm registry: `eventsource-parser@3.0.8` [VERIFIED: npm view]
- npm registry: `http-proxy-middleware@4.0.0` [VERIFIED: npm view]

### Secondary (MEDIUM confidence)
- OpenAI API documentation: Chat Completions streaming format [CITED: platform.openai.com/docs]
- Anthropic API documentation: Messages streaming format [CITED: docs.anthropic.com]

### Tertiary (LOW confidence)
- A1-A4 assumptions in Assumptions Log need user confirmation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via npm registry, reference implementations
- Architecture: HIGH — reference implementations provide proven patterns
- Pitfalls: HIGH — multiple reference implementations confirm these failure modes
- Provider API formats: MEDIUM — OpenRouter confirmed via reference; OpenCode/Ollama assumed

**Research date:** 2026-05-10
**Valid until:** 30 days (stable domain; API formats change infrequently)
