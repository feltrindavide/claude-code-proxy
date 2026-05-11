/**
 * Custom adapter — generic OpenAI-compatible fallback
 * Phase: 02-sse-streaming-integration
 * Plan: 02-02, Task 3
 *
 * Generic OpenAI-compatible adapter for any provider that supports
 * /v1/chat/completions with SSE streaming. Same bidirectional transform
 * as OpenCodeAdapter but intended for arbitrary providers.
 *
 * Per D-15: Provider-specific adapter (generic fallback)
 * Per D-16: Bidirectional transforms
 * Per D-21: Timeouts: 120s streaming / 30s non-streaming
 * Per D-25: POST /v1/chat/completions fallback for validation
 * Per D-26/D-27: Error transformation to Anthropic format
 * Per D-28: User-friendly error messages
 *
 * Threat mitigations:
 * - T-02-07: AbortController with 120s streaming timeout
 */
import type { ProviderAdapter, AnthropicMessagesBody, TransformOptions, ValidationResult } from './interface.js';
import type { RouteResolution } from '../types/index.js';
export declare class CustomAdapter implements ProviderAdapter {
    readonly providerType = "custom";
    readonly apiPath = "/v1/chat/completions";
    timeouts: {
        streaming: number;
        nonStreaming: number;
    };
    /**
     * Transform Anthropic messages → OpenAI chat/completions format
     * (Same as OpenCodeAdapter — generic OpenAI-compatible)
     */
    transformRequest(body: AnthropicMessagesBody, route: RouteResolution): Record<string, unknown>;
    /**
     * Transform OpenAI SSE → Anthropic SSE via SSEBuilder
     * (Same as OpenCodeAdapter)
     */
    transformResponse(upstreamResponse: Response, options: TransformOptions): AsyncIterable<string>;
    /**
     * Validate connectivity — GET /v1/models with POST /v1/chat/completions fallback
     */
    validate(baseUrl: string, apiKey: string): Promise<ValidationResult>;
    private emitError;
    private formatSSEEvent;
}
//# sourceMappingURL=custom.d.ts.map