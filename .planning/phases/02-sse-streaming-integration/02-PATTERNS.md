# Phase 2: SSE Streaming & Integration - Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 11 new/modified files
**Analogs found:** 10 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/proxy/src/adapters/interface.ts` | interface | — | `reference/free-claude-code/providers/base.py` | role-match |
| `packages/proxy/src/adapters/index.ts` | registry/factory | request-response | `reference/claude-code-router/packages/core/src/services/transformer.ts` | role-match |
| `packages/proxy/src/adapters/openrouter.ts` | adapter | request-response + streaming | `reference/free-claude-code/providers/open_router/client.py` | role-match |
| `packages/proxy/src/adapters/opencode.ts` | adapter | request-response + streaming | `reference/free-claude-code/providers/openai_compat.py` | role-match |
| `packages/proxy/src/adapters/ollama.ts` | adapter | request-response + streaming | `reference/free-claude-code/providers/ollama/` | role-match |
| `packages/proxy/src/adapters/custom.ts` | adapter | request-response + streaming | `reference/free-claude-code/providers/openai_compat.py` | role-match |
| `packages/proxy/src/services/sse-transformer.ts` | service | streaming | `reference/free-claude-code/core/anthropic/sse.py` | role-match |
| `packages/proxy/src/services/provider-validator.ts` | service | request-response | `packages/proxy/src/services/provider.ts` | exact |
| `packages/proxy/src/proxy.ts` | handler | request-response + streaming | `packages/proxy/src/proxy.ts` (existing) | exact |
| `packages/proxy/src/routes/admin.ts` | routes | request-response | `packages/proxy/src/routes/admin.ts` (existing) | exact |
| `packages/proxy/src/types/index.ts` | types | — | `packages/proxy/src/types/index.ts` (existing) | exact |

## Pattern Assignments

### `packages/proxy/src/adapters/interface.ts` (interface)

**Analog:** `reference/free-claude-code/providers/base.py` (BaseProvider abstract class) + CONTEXT.md D-18

**Pattern to copy:** Abstract interface with `transformRequest()`, `transformResponse()`, `validate()`, and `timeouts` properties.

```typescript
// packages/proxy/src/adapters/interface.ts
import type { RouteResolution } from '../types/index.js';

export interface AnthropicMessagesBody {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
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

export interface ProviderAdapter {
  readonly providerType: string;
  timeouts: { streaming: number; nonStreaming: number };
  transformRequest(anthropicBody: AnthropicMessagesBody, route: RouteResolution): Record<string, unknown>;
  transformResponse(upstreamResponse: Response, options: TransformOptions): AsyncIterable<string>;
  validate(baseUrl: string, apiKey: string): Promise<ValidationResult>;
}
```

---

### `packages/proxy/src/adapters/index.ts` (registry/factory)

**Analog:** `reference/claude-code-router/packages/core/src/services/transformer.ts` (TransformerService registry pattern)

**Imports pattern** — use Map-based registry like ProviderService:

```typescript
// packages/proxy/src/adapters/index.ts
import type { ProviderAdapter } from './interface.js';
import { OpenRouterAdapter } from './openrouter.js';
import { OpenCodeAdapter } from './opencode.js';
import { OllamaAdapter } from './ollama.js';
import { CustomAdapter } from './custom.js';

const adapters = new Map<string, ProviderAdapter>();

export function registerAdapter(adapter: ProviderAdapter): void {
  adapters.set(adapter.providerType, adapter);
}

export function getAdapter(providerType: string): ProviderAdapter | undefined {
  return adapters.get(providerType);
}

export function getOrCreateAdapter(providerType: string, baseUrl: string): ProviderAdapter {
  const existing = getAdapter(providerType);
  if (existing) return existing;
  // Fallback to custom OpenAI-compatible adapter
  return new CustomAdapter();
}

// Register built-in adapters
registerAdapter(new OpenRouterAdapter());
registerAdapter(new OpenCodeAdapter());
registerAdapter(new OllamaAdapter());
registerAdapter(new CustomAdapter());
```

---

### `packages/proxy/src/adapters/openrouter.ts` (adapter, streaming)

**Analog:** `reference/free-claude-code/providers/open_router/client.py` — uses native Anthropic endpoint

**Key pattern:** OpenRouter supports native Anthropic `/v1/messages` API, so `transformRequest()` is mostly passthrough and `transformResponse()` passes through SSE events with minimal transformation (filter `[DONE]` noise).

```typescript
// packages/proxy/src/adapters/openrouter.ts
import type { ProviderAdapter, AnthropicMessagesBody, TransformOptions, ValidationResult } from './interface.js';
import type { RouteResolution } from '../types/index.js';
import { createParser } from 'eventsource-parser';
import type { ParsedEvent } from 'eventsource-parser';

export class OpenRouterAdapter implements ProviderAdapter {
  readonly providerType = 'openrouter';
  timeouts = { streaming: 120_000, nonStreaming: 30_000 };

  transformRequest(body: AnthropicMessagesBody, _route: RouteResolution): Record<string, unknown> {
    // OpenRouter supports native Anthropic endpoint — passthrough with header adjustment
    return {
      ...body,
      stream: true,
    };
  }

  async *transformResponse(
    upstreamResponse: Response,
    options: TransformOptions,
  ): AsyncIterable<string> {
    // OpenRouter returns native Anthropic SSE — pass through with [DONE] filtering
    const parser = createParser({
      onEvent: (event) => {
        // Filter out terminal noise events
        if (event.data === '[DONE]') return;
        yield `event: ${event.event || 'message'}\ndata: ${event.data}\n\n`;
      },
    });
    // ... stream reading logic (see sse-transformer.ts pattern below)
  }

  async validate(baseUrl: string, apiKey: string): Promise<ValidationResult> {
    try {
      // OpenRouter supports GET /v1/models
      const resp = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return { valid: true, models: data.data?.map((m: any) => m.id) };
      }
      return { valid: false, error: `Validation failed: ${resp.status}` };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
```

---

### `packages/proxy/src/adapters/opencode.ts` (adapter, streaming)

**Analog:** `reference/free-claude-code/providers/openai_compat.py` (OpenAIChatTransport) — full bidirectional transform

**Core pattern:** Transform Anthropic messages → OpenAI chat/completions format, then transform OpenAI SSE → Anthropic SSE using SSEBuilder.

```typescript
// packages/proxy/src/adapters/opencode.ts
import type { ProviderAdapter, AnthropicMessagesBody, TransformOptions, ValidationResult } from './interface.js';
import type { RouteResolution } from '../types/index.js';
import { SSEBuilder } from '../services/sse-transformer.js';

export class OpenCodeAdapter implements ProviderAdapter {
  readonly providerType = 'opencode';
  timeouts = { streaming: 120_000, nonStreaming: 30_000 };

  transformRequest(body: AnthropicMessagesBody, route: RouteResolution): Record<string, unknown> {
    // Anthropic messages → OpenAI chat/completions format
    const messages = body.messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: typeof msg.content === 'string'
        ? msg.content
        : msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n'),
    }));

    return {
      model: route.targetModel,
      messages,
      stream: true,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
    };
  }

  async *transformResponse(
    upstreamResponse: Response,
    options: TransformOptions,
  ): AsyncIterable<string> {
    const sse = new SSEBuilder(options.messageId, options.model, options.inputTokens);
    yield sse.message_start();

    // Parse SSE lines from upstream, transform each chunk
    // ... (see sse-transformer.ts for parsing pattern)
    // For each OpenAI chunk:
    //   - delta.content → sse.ensure_text_block() + sse.emit_text_delta()
    //   - finish_reason → sse.close_content_blocks() + sse.message_delta() + sse.message_stop()
  }

  async validate(baseUrl: string, apiKey: string): Promise<ValidationResult> {
    // Try GET /v1/models first, fallback to POST /v1/chat/completions
    // (see RESEARCH.md Pattern 3 validate() method, lines 480-509)
  }
}
```

---

### `packages/proxy/src/adapters/ollama.ts` (adapter, streaming)

**Analog:** `reference/free-claude-code/providers/ollama/` — Ollama uses native Anthropic `/v1/messages`

**Key pattern:** Similar to OpenRouter — Ollama 4.x+ supports native Anthropic messages API, so minimal transformation needed.

```typescript
// packages/proxy/src/adapters/ollama.ts
import type { ProviderAdapter, AnthropicMessagesBody, TransformOptions, ValidationResult } from './interface.js';
import type { RouteResolution } from '../types/index.js';

export class OllamaAdapter implements ProviderAdapter {
  readonly providerType = 'ollama';
  timeouts = { streaming: 120_000, nonStreaming: 30_000 };

  transformRequest(body: AnthropicMessagesBody, route: RouteResolution): Record<string, unknown> {
    // Ollama supports native Anthropic endpoint — passthrough
    return { ...body, stream: true };
  }

  async *transformResponse(upstreamResponse: Response, options: TransformOptions): AsyncIterable<string> {
    // Pass through native Anthropic SSE, filter [DONE]
  }

  async validate(baseUrl: string, _apiKey: string): Promise<ValidationResult> {
    // Ollama is local — simple connectivity check
    try {
      const resp = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) });
      return { valid: resp.ok };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
```

---

### `packages/proxy/src/adapters/custom.ts` (adapter, streaming)

**Analog:** `reference/free-claude-code/providers/openai_compat.py` — generic OpenAI-compatible adapter

**Key pattern:** Same as OpenCodeAdapter but configurable for any OpenAI-compatible provider.

---

### `packages/proxy/src/services/sse-transformer.ts` (service, streaming)

**Analog:** `reference/free-claude-code/core/anthropic/sse.py` (SSEBuilder class, 416 lines)

**Imports pattern:**

```typescript
// packages/proxy/src/services/sse-transformer.ts
import { createParser } from 'eventsource-parser';
import type { ParsedEvent } from 'eventsource-parser';
```

**Core SSEBuilder pattern** (copy structure from `sse.py` lines 167-388):

```typescript
// SSE event formatting (sse.py line 45-47)
function formatSSEEvent(eventType: string, data: Record<string, unknown>): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Stop reason mapping (sse.py lines 20-29)
const STOP_REASON_MAP: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'end_turn',
};

export function mapStopReason(openaiReason: string | null): string {
  return STOP_REASON_MAP[openaiReason ?? ''] ?? 'end_turn';
}

// ContentBlockManager (sse.py lines 64-159) — tracks open blocks, allocates indices
class ContentBlockManager {
  private nextIndex = 0;
  private textStarted = false;
  private textIndex = -1;

  allocateIndex(): number {
    const idx = this.nextIndex++;
    return idx;
  }

  ensureTextBlock(): string[] {
    const events: string[] = [];
    if (!this.textStarted) {
      events.push(this.startTextBlock());
    }
    return events;
  }

  private startTextBlock(): string {
    this.textIndex = this.allocateIndex();
    this.textStarted = true;
    return formatSSEEvent('content_block_start', {
      type: 'content_block_start',
      index: this.textIndex,
      content_block: { type: 'text', text: '' },
    });
  }

  closeContentBlocks(): string[] {
    const events: string[] = [];
    if (this.textStarted) {
      events.push(formatSSEEvent('content_block_stop', {
        type: 'content_block_stop',
        index: this.textIndex,
      }));
      this.textStarted = false;
    }
    return events;
  }
}

// SSEBuilder class (sse.py lines 167-388)
export class SSEBuilder {
  private blocks = new ContentBlockManager();

  constructor(
    private messageId: string,
    private model: string,
    private inputTokens: number,
  ) {}

  message_start(): string {
    return formatSSEEvent('message_start', {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: this.inputTokens, output_tokens: 1 },
      },
    });
  }

  message_delta(stopReason: string, outputTokens: number): string {
    return formatSSEEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { input_tokens: this.inputTokens, output_tokens: outputTokens },
    });
  }

  message_stop(): string {
    return formatSSEEvent('message_stop', { type: 'message_stop' });
  }

  emitTextDelta(content: string): string {
    return formatSSEEvent('content_block_delta', {
      type: 'content_block_delta',
      index: this.blocks.allocateIndex(), // Use tracked index
      delta: { type: 'text_delta', text: content },
    });
  }

  emitTopLevelError(errorMessage: string): string {
    return formatSSEEvent('error', {
      type: 'error',
      error: { type: 'api_error', message: errorMessage },
    });
  }
}
```

**SSE parser pattern** (from RESEARCH.md lines 373-404, based on `eventsource-parser`):

```typescript
export function parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncIterable<ParsedEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return {
    async *[Symbol.asyncIterator]() {
      const parser = createParser({
        onEvent: (event) => { /* yield via accumulator */ },
      });
      // ... stream reading loop (see RESEARCH.md lines 389-401)
    },
  };
}
```

---

### `packages/proxy/src/services/provider-validator.ts` (service, request-response)

**Analog:** `packages/proxy/src/services/provider.ts` (ProviderService pattern, 113 lines)

**Imports pattern** (from `provider.ts` lines 1-9):

```typescript
import type { ValidationResult } from '../adapters/interface.js';
import { getAdapter } from '../adapters/index.js';
import { keychainService } from './keychain.js';
```

**Class pattern** (copy structure from `provider.ts` lines 14-110):

```typescript
export class ProviderValidatorService {
  async validateProvider(name: string, baseUrl: string): Promise<ValidationResult> {
    const adapter = getAdapter(name);
    if (!adapter) {
      return { valid: false, error: `No adapter found for provider: ${name}` };
    }
    const apiKey = await keychainService.getKey(name);
    if (!apiKey) {
      return { valid: false, error: `API key not found for provider: ${name}` };
    }
    return adapter.validate(baseUrl, apiKey);
  }

  async validateAllProviders(): Promise<Map<string, ValidationResult>> {
    // Iterate all registered providers, validate each
  }
}
```

---

### `packages/proxy/src/proxy.ts` (handler, request-response + streaming)

**Analog:** `packages/proxy/src/proxy.ts` (existing, 48 lines) — **replacing** `selfHandleResponse: false` with custom handler

**Pattern to copy:** The existing file structure (imports, exports) but replace `createProxyMiddleware` with a full Express route handler.

**New handler pattern** (from RESEARCH.md lines 240-306):

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
  const adapter = getAdapter(resolution.provider.providerType);

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
      inputTokens: 0,
    })) {
      res.write(event);
    }
    res.end();
  } catch (error) {
    clearTimeout(timeout);
    emitAnthropicError(res, error);
  }
}

function emitAnthropicError(res: Response, error: unknown) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const message = error instanceof Error ? error.message : String(error);
  res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message } })}\n\n`);
  res.end();
}
```

**How to wire in `index.ts`:** Replace `app.use('/v1', createProxyHandler())` with:

```typescript
app.post('/v1/messages', express.json(), handleProxyRequest);
```

---

### `packages/proxy/src/routes/admin.ts` (routes, request-response)

**Analog:** `packages/proxy/src/routes/admin.ts` (existing, 206 lines)

**Pattern to copy:** Express Router pattern with zod validation, try/catch error handling, async handlers.

**New validation endpoint** (add to existing router, following pattern from lines 111-141):

```typescript
// POST /admin/providers/:id/validate — validate provider connectivity (D-22)
router.post('/providers/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = providerService.getProvider(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const apiKey = await keychainService.getKey(provider.name);
    if (!apiKey) {
      return res.status(400).json({ error: 'API key not found for provider' });
    }

    // Import validator service
    const { providerValidatorService } = await import('../services/provider-validator.js');
    const result = await providerValidatorService.validateProvider(provider.name, provider.baseUrl);

    res.json(result);
  } catch (error) {
    console.error('[Admin] Error validating provider:', error);
    res.status(500).json({ error: 'Failed to validate provider' });
  }
});
```

**Also extend POST /admin/providers** to call validation on save (D-22):

```typescript
// After registering provider (line 134), add:
const validationResult = await providerValidatorService.validateProvider(name, baseUrl);
if (!validationResult.valid) {
  // Log warning but don't block — user may fix later
  console.warn(`[Admin] Provider validation warning: ${validationResult.error}`);
}
```

---

### `packages/proxy/src/types/index.ts` (types)

**Analog:** `packages/proxy/src/types/index.ts` (existing, 35 lines)

**Pattern to copy:** Simple export pattern — add new types alongside existing ones.

```typescript
// Add to existing types/index.ts:
export interface AdapterConfig {
  providerType: string;
  timeouts?: { streaming?: number; nonStreaming?: number };
}
```

---

## Shared Patterns

### Authentication / API Key Retrieval
**Source:** `packages/proxy/src/services/keychain.ts` (lines 48-55)
**Apply to:** All adapters, proxy handler, validator service

```typescript
const apiKey = await keychainService.getKey(resolution.provider.name);
if (!apiKey) {
  return emitAnthropicError(res, 'API key not found for provider: ' + resolution.provider.name);
}
```

### Error Handling (Anthropic SSE format)
**Source:** `reference/free-claude-code/core/anthropic/sse.py` (lines 368-379) + `reference/free-claude-code/core/anthropic/provider_stream_error.py` (lines 20-33)
**Apply to:** All adapters, proxy handler, SSEBuilder

```typescript
// Top-level error (before streaming starts)
function emitTopLevelError(errorMessage: string): string {
  return formatSSEEvent('error', {
    type: 'error',
    error: { type: 'api_error', message: errorMessage },
  });
}

// Mid-stream error (after content blocks opened)
// Must close all blocks first, then emit error as text block, then message_delta + message_stop
function* emitMidStreamError(sse: SSEBuilder, errorMessage: string): Generator<string> {
  yield* sse.close_all_blocks();
  if (sse.blocks.has_emitted_tool_block()) {
    yield sse.emit_top_level_error(errorMessage);
  } else {
    yield* sse.emit_error(errorMessage);
  }
  yield sse.message_delta('end_turn', 1);
  yield sse.message_stop();
}
```

### Error Message Formatting (user-friendly)
**Source:** `reference/free-claude-code/core/anthropic/errors.py` (lines 7-57)
**Apply to:** All adapters' validate() and transformResponse() error paths

```typescript
// Map error types to user-friendly messages (never expose API keys or internals)
function getUserFacingErrorMessage(error: unknown, timeoutMs?: number): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return timeoutMs
      ? `Provider request timed out after ${timeoutMs / 1000}s.`
      : 'Provider request timed out.';
  }
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Could not connect to provider.';
  }
  if (error instanceof Error) {
    // Sanitize — remove any potential key leakage
    const sanitized = error.message.replace(/sk-[a-zA-Z0-9-]+/g, '[KEY]');
    return sanitized || 'Provider request failed.';
  }
  return 'Provider request failed unexpectedly.';
}
```

### Timeout Management
**Source:** RESEARCH.md D-21 + `reference/free-claude-code/providers/openai_compat.py` (lines 84-100)
**Apply to:** All adapters, proxy handler

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), adapter.timeouts.streaming);
try {
  const response = await fetch(url, { signal: controller.signal, ... });
  clearTimeout(timeout);
} catch (error) {
  clearTimeout(timeout);
  throw error;
}
```

### Validation Pattern (GET /v1/models with POST fallback)
**Source:** RESEARCH.md lines 480-509 (OpenCodeAdapter validate method)
**Apply to:** All adapter validate() methods

```typescript
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (testResp.ok || testResp.status === 400) {
      return { valid: true }; // 400 means endpoint works but "test" model not found
    }
    return { valid: false, error: `Validation failed: ${testResp.status}` };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

### Admin Route Pattern
**Source:** `packages/proxy/src/routes/admin.ts` (lines 111-141)
**Apply to:** New validation endpoint

```typescript
router.post('/providers/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = providerService.getProvider(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    // ... validation logic
    res.json(result);
  } catch (error) {
    console.error('[Admin] Error validating provider:', error);
    res.status(500).json({ error: 'Failed to validate provider' });
  }
});
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/proxy/src/adapters/interface.ts` | interface | — | No TypeScript interface for provider adapters exists yet; pattern derived from Python `BaseProvider` abstract class |

---

## Metadata

**Analog search scope:** `packages/proxy/src/`, `reference/free-claude-code/`, `reference/claude-code-router/packages/core/src/`
**Files scanned:** 15
**Pattern extraction date:** 2026-05-10
