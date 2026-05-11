# Domain Pitfalls: Claude Code Proxy

**Domain:** AI Proxy / LLM Model Routing
**Researched:** 2026-05-10
**Confidence:** MEDIUM-HIGH

This document catalogs critical mistakes specific to building AI proxy systems that route Claude Code requests to alternative LLM providers. Each pitfall includes warning signs, prevention strategies, and relevant phase mapping.

---

## Critical Pitfalls

### Pitfall 1: SSE Streaming Mismatch with Target Provider

**What goes wrong:** The proxy correctly forwards requests but fails to properly handle Server-Sent Events from the downstream provider. This results in corrupted streaming responses, truncated output, or complete failure to stream tokens back to Claude Code.

**Why it happens:** Different LLM providers use incompatible SSE formats. Anthropic uses a custom event schema (`message_start`, `content_block_delta`, `text_delta`, etc.) while OpenAI-compatible providers use standard SSE with `data: [json]` payloads. Additionally, some providers don't support SSE at all or have buggy implementations.

**Consequences:**
- Claude Code hangs indefinitely waiting for response
- Responses appear garbled or truncated in Claude Code UI
- Tool calling fails silently because tool result events don't arrive

**Prevention:**
- Implement a robust SSE parser that can handle both Anthropic-style and OpenAI-style streams
- Add SSE format detection based on the downstream provider
- Test with both streaming and non-streaming modes for each provider
- Set appropriate timeouts for streaming connections (longer than non-streaming)

**Warning signs:**
- First token arrives but stream stalls mid-response
- Non-streaming works but streaming fails
- Different providers show different streaming behaviors

**Phase to address:** Phase 2 (Core Proxy Middleware) — Streaming support is fundamental infrastructure

---

### Pitfall 2: Tool Calling Schema Transformation Incompleteness

**What goes wrong:** Claude Code sends tool definitions in Anthropic's `input_schema` format, but the downstream OpenAI-compatible provider expects OpenAI's `parameters` format. The proxy fails to properly transform these, causing tools to be rejected or malformed.

**Why it happens:** The schema transformation seems straightforward but has subtle differences:
- Anthropic uses `input_schema` as the key; OpenAI uses `parameters`
- OpenAI wraps in `{"type": "function", "function": {...}}`; Anthropic uses flat structure
- Enum handling differs between providers
- Some providers don't support all JSON Schema features (like `$ref`)

**Consequences:**
- Tools defined in Claude Code are not available to the downstream model
- Tool calls return validation errors
- The model ignores tools entirely and tries to answer without them

**Prevention:**
- Implement complete schema transformation layer with provider-specific adapters
- Test each tool definition format with actual model calls
- Provide fallback for providers with limited schema support
- Log schema transformations for debugging

**Warning signs:**
- Claude Code shows no tools available despite defining them
- Tool call attempts result in model responding without tools
- Schema validation errors in downstream provider responses

**Phase to address:** Phase 3 (Provider Adapters & Transformations) — Tool calling is a core use case

---

### Pitfall 3: Model Mapping Ambiguity Causes Routing Loops

**What goes wrong:** The user configures `opus -> opencode/qwen3.6`, but the downstream model returns a response with metadata that suggests it's a different model, or the proxy misinterprets which model was actually used. This creates confusion about whether routing is working.

**Why it happens:**
- Model identifiers in API responses vary by provider (some include version strings, some don't)
- The proxy may not accurately track which model was actually used
- Model aliases create confusion (e.g., "sonnet" could mean multiple things)

**Consequences:**
- User cannot verify their routing configuration is working
- Cost tracking becomes inaccurate
- Debugging which model handled which request becomes impossible

**Prevention:**
- Log the actual model used for each request
- Verify model response by checking response metadata
- Create clear mapping tables with explicit model identifiers
- Add a "passthrough mode" for testing that logs original vs mapped model

**Warning signs:**
- Response metadata shows different model than configured
- Cost estimates don't match expected provider pricing
- User reports "I configured X but it feels like Y"

**Phase to address:** Phase 2 (Core Proxy Middleware) — Routing verification is essential

---

### Pitfall 4: Authentication Credential Handling Leaks Secrets

**What goes wrong:** The proxy stores API keys in plaintext, logs them accidentally, or passes them to the wrong provider. This exposes credentials that could allow unauthorized access to user's AI accounts.

**Why it happens:**
- Environment variables logged in debug output
- Config files written with keys in plaintext
- Keys passed to wrong provider due to routing errors
- No secure storage mechanism implemented

**Consequences:**
- API key exposure in logs or error messages
- Unauthorized charges on user's accounts
- Account compromise if keys are leaked publicly

**Prevention:**
- Use macOS Keychain for credential storage (like grok-cli does)
- Never log API keys, even in debug mode
- Validate that keys are only sent to the correct provider
- Implement proper secret masking in all logging

**Warning signs:**
- API keys appear in log files
- Error messages expose partial keys
- No secure storage mechanism visible in config

**Phase to address:** Phase 1 (Project Setup & Config) — Security must be foundational

---

## Moderate Pitfalls

### Pitfall 5: Rate Limiting Without Graceful Degradation

**What goes wrong:** The downstream provider rate limits the request, but the proxy doesn't handle this gracefully. It either fails immediately or retries in a tight loop, causing request failures.

**Why it happens:**
- No exponential backoff implemented
- Rate limit headers not properly parsed
- No fallback to alternative model when rate limited

**Consequences:**
- Requests fail during high-usage periods
- No visibility into why requests failed
- User experience degrades without clear cause

**Prevention:**
- Implement proper rate limit header parsing (from each provider)
- Add exponential backoff with jitter
- Consider model fallback as a mitigation strategy
- Log rate limit events for debugging

**Warning signs:**
- Intermittent failures at certain times of day
- Error messages indicate rate limiting
- No retry mechanism visible in code

**Phase to address:** Phase 3 (Provider Adapters & Transformations)

---

### Pitfall 6: Request/Response Content Block Transformation Incompleteness

**What goes wrong:** Claude Code sends content in Anthropic's `ContentBlock` format (text, image, tool_use, tool_result), but the proxy fails to properly transform these when forwarding to OpenAI-compatible providers.

**Why it happens:**
- Image handling differs significantly between providers
- Tool result blocks need specific format conversion
- Multi-modal content isn't uniformly supported

**Consequences:**
- Messages with images fail completely
- Tool execution results aren't properly returned to the model
- Some content types are silently dropped

**Prevention:**
- Implement complete content block transformer
- Handle image uploads appropriately for each provider
- Test with actual multi-modal requests

**Warning signs:**
- Image-based requests fail
- Tool results don't appear in conversation
- Content appears to be silently lost

**Phase to address:** Phase 3 (Provider Adapters & Transformations)

---

### Pitfall 7: Timeout Mismanagement Causes Hanging Requests

**What goes wrong:** The proxy uses default timeouts that are too short for LLM requests, or doesn't handle timeout errors gracefully. This causes requests to fail mid-response or hang indefinitely.

**Why it happens:**
- Default HTTP timeouts (often 30s) are too short for LLM responses
- Streaming connections need longer timeouts than non-streaming
- No timeout handling for partial responses

**Consequences:**
- Long-running requests fail unexpectedly
- User sees "request timed out" errors
- Partial responses are lost

**Prevention:**
- Set appropriate timeouts for LLM requests (120s+ for streaming)
- Differentiate between connection timeout and read timeout
- Implement proper error handling for timeout scenarios
- Allow timeout configuration per provider

**Warning signs:**
- Timeout errors in logs
- Requests fail at predictable durations
- No timeout configuration options

**Phase to address:** Phase 2 (Core Proxy Middleware)

---

### Pitfall 8: Provider API Version Incompatibility

**What goes wrong:** The proxy uses a specific API version or endpoint that works today but breaks when providers update their APIs. No version pinning or compatibility checking.

**Why it happens:**
- Hardcoded API endpoints without version awareness
- No compatibility checking when provider updates API
- Breaking changes in provider APIs aren't handled

**Consequences:**
- Proxy stops working after provider API updates
- Sudden failures with no clear cause
- No path to fix until code is updated

**Prevention:**
- Pin specific API versions where possible
- Add compatibility checks on startup
- Monitor provider API changelogs
- Implement graceful degradation for deprecated features

**Warning signs:**
- Recent provider changes cause failures
- No version pinning in API calls
- No changelog monitoring

**Phase to address:** Phase 3 (Provider Adapters & Transformations) — Need provider-specific version management

---

## Minor Pitfalls

### Pitfall 9: Configuration Format Complexity Creates User Friction

**What goes wrong:** The proxy uses a complex configuration format (JSON5, custom DSL, complex YAML) that creates friction for users. They can't easily configure model mappings or provider settings.

**Why it happens:**
- Overly complex configuration schema
- Lack of validation feedback
- No sensible defaults

**Consequences:**
- Users give up on configuration
- Configuration errors cause confusing failures
- High barrier to adoption

**Prevention:**
- Start with simple, minimal configuration
- Provide clear error messages for misconfiguration
- Consider a UI for common settings
- Provide working examples for common use cases

**Warning signs:**
- Users report confusion about configuration
- Multiple configuration-related issues in feedback
- No clear migration path for config changes

**Phase to address:** Phase 4 (Configuration & Persistence) — UX around config matters

---

### Pitfall 10: Silent Failure Mode Masks Real Problems

**What goes wrong:** When the proxy encounters an error, it returns a generic or silent failure that doesn't tell the user what went wrong. This makes debugging extremely difficult.

**Why it happens:**
- Generic error messages for security (hiding details)
- Error handling not properly implemented
- Lack of logging

**Consequences:**
- Users can't diagnose problems
- Issues go unresolved for too long
- Support burden increases

**Prevention:**
- Implement proper error categorization
- Log detailed errors for debugging
- Return useful error messages (not exposing secrets)
- Provide troubleshooting guidance

**Warning signs:**
- Generic "internal error" messages
- No logging visible
- Errors don't indicate the actual cause

**Phase to address:** Phase 2 (Core Proxy Middleware) — Error handling is foundational

---

## Phase-Specific Warning Summary

| Phase | Likely Pitfall | Mitigation Approach |
|-------|----------------|---------------------|
| Phase 1: Project Setup | Pitfall 4: Credential leaks | Use Keychain from start, no plaintext storage |
| Phase 2: Core Proxy | Pitfall 1: SSE streaming | Implement robust streaming parser early |
| Phase 2: Core Proxy | Pitfall 3: Mapping ambiguity | Log actual model used for each request |
| Phase 2: Core Proxy | Pitfall 7: Timeouts | Configure appropriate LLM timeouts |
| Phase 2: Core Proxy | Pitfall 10: Silent failures | Implement detailed logging and errors |
| Phase 3: Provider Adapters | Pitfall 2: Tool schemas | Test tool transformation for each provider |
| Phase 3: Provider Adapters | Pitfall 5: Rate limits | Implement backoff and fallback |
| Phase 3: Provider Adapters | Pitfall 6: Content blocks | Handle all content types properly |
| Phase 4: Configuration | Pitfall 9: Config complexity | Start simple, add validation |

---

## Sources & References

- **claude-code-router** — Reference implementation with agent system, transformer architecture
- **free-claude-code** — Python proxy with provider abstraction patterns
- **llm-router** (GitHub) — Minimal routing proxy with routing logic examples
- **fuergaosi233/claude-code-proxy** — 2.6k stars, shows common SSE handling patterns
- **ziozzang/claude2openai-proxy** — Notes model mapping challenges and tool calling issues
- **Dev.to article** — Streaming tool calls SSE parsing deep dive
- **Reddit community** — Real-world issues: model capability mismatches, tool calling failures

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| SSE/Streaming issues | HIGH | Multiple sources confirm this is the #1 failure point |
| Tool transformation | HIGH | Well-documented API differences between providers |
| Authentication | MEDIUM | Security patterns well-known, but Keychain specifics need phase validation |
| Rate limiting | MEDIUM | Standard practice varies, needs provider-specific testing |
| Configuration | LOW | User friction patterns need UX validation in later phases |

**Overall confidence:** MEDIUM-HIGH — Core technical pitfalls well-researched; user-facing pitfalls need validation during implementation.