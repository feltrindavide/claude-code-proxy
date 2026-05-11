/**
 * OpenCode adapter — full bidirectional transform (Anthropic ↔ OpenAI)
 * Phase: 02-sse-streaming-integration
 * Plan: 02-02, Task 2
 *
 * OpenCode Zen/Go uses OpenAI-compatible /v1/chat/completions format.
 * This adapter transforms Anthropic messages to OpenAI format for requests,
 * and transforms OpenAI SSE chunks back to Anthropic SSE events for responses.
 *
 * Per D-15: Provider-specific adapter
 * Per D-16: Bidirectional transforms
 * Per D-21: Timeouts: 120s streaming / 30s non-streaming
 * Per D-25: POST /v1/chat/completions fallback for validation
 * Per D-26/D-27: Error transformation to Anthropic format
 * Per D-28: User-friendly error messages
 *
 * Threat mitigations:
 * - T-02-07: AbortController with 120s streaming timeout
 * - T-02-08: Validate tool schema transformation without injecting arbitrary content
 */
import type { ProviderAdapter, AnthropicMessagesBody, TransformOptions, ValidationResult } from './interface.js';
import type { RouteResolution } from '../types/index.js';
export declare class OpenCodeAdapter implements ProviderAdapter {
    readonly providerType = "opencode";
    readonly apiPath = "/v1/chat/completions";
    timeouts: {
        streaming: number;
        nonStreaming: number;
    };
    /**
     * Transform Anthropic messages → OpenAI chat/completions format
     */
    transformRequest(body: AnthropicMessagesBody, route: RouteResolution): Record<string, unknown>;
    /**
     * Transform OpenAI SSE → Anthropic SSE via SSEBuilder
     */
    transformResponse(upstreamResponse: Response, options: TransformOptions): AsyncIterable<string>;
    /**
     * Validate OpenCode connectivity — GET /v1/models with POST fallback (D-25)
     */
    validate(baseUrl: string, apiKey: string): Promise<ValidationResult>;
    private fallbackValidate;
    private emitError;
    private formatSSEEvent;
}
//# sourceMappingURL=opencode.d.ts.map