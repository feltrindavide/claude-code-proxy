/**
 * Ollama adapter — native Anthropic passthrough
 * Phase: 02-sse-streaming-integration
 * Plan: 02-02, Task 3
 *
 * Ollama 4.x+ supports native Anthropic /v1/messages endpoint,
 * so minimal transformation is needed — just pass through with [DONE] filtering.
 *
 * Per D-21: Timeouts: 120s streaming / 30s non-streaming
 * Per D-23: Ollama is local, use GET /api/tags for validation
 * Per T-02-09: Ollama is local-only — no API key required, low spoofing risk
 */
import type { ProviderAdapter, AnthropicMessagesBody, TransformOptions, ValidationResult } from './interface.js';
import type { RouteResolution } from '../types/index.js';
export declare class OllamaAdapter implements ProviderAdapter {
    readonly providerType = "ollama";
    readonly apiPath = "/v1/messages";
    timeouts: {
        streaming: number;
        nonStreaming: number;
    };
    /**
     * Ollama supports native Anthropic endpoint — passthrough with stream flag
     */
    transformRequest(body: AnthropicMessagesBody, route: RouteResolution): Record<string, unknown>;
    /**
     * Pass through native Anthropic SSE, filter [DONE] terminal events
     */
    transformResponse(upstreamResponse: Response, _options: TransformOptions): AsyncIterable<string>;
    /**
     * Validate Ollama connectivity — Ollama is local, use /api/tags endpoint
     * No API key needed (apiKey parameter ignored)
     */
    validate(baseUrl: string, _apiKey: string): Promise<ValidationResult>;
    private emitError;
}
//# sourceMappingURL=ollama.d.ts.map