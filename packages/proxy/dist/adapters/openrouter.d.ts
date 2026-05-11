/**
 * OpenRouter adapter — native Anthropic API passthrough
 * Phase: 02-sse-streaming-integration
 * Plan: 02-01
 *
 * OpenRouter supports the native Anthropic messages API (POST /v1/messages
 * with anthropic-version header), so transformRequest() is mostly passthrough
 * and transformResponse() passes through SSE events with minimal transformation
 * (filtering terminal noise like [DONE]).
 *
 * Per D-21: Timeouts: 120s streaming / 30s non-streaming
 * Per D-23: Per-adapter validation logic
 * Per D-24: GET /v1/models as default validation
 */
import type { ProviderAdapter, AnthropicMessagesBody, TransformOptions, ValidationResult } from './interface.js';
import type { RouteResolution } from '../types/index.js';
export declare class OpenRouterAdapter implements ProviderAdapter {
    readonly providerType = "openrouter";
    readonly apiPath = "/v1/messages";
    timeouts: {
        streaming: number;
        nonStreaming: number;
    };
    /**
     * OpenRouter supports native Anthropic endpoint — passthrough with stream flag
     */
    transformRequest(body: AnthropicMessagesBody, route: RouteResolution): Record<string, unknown>;
    /**
     * OpenRouter returns native Anthropic SSE — pass through with [DONE] filtering
     */
    transformResponse(upstreamResponse: Response, _options: TransformOptions): AsyncIterable<string>;
    /**
     * Validate OpenRouter connectivity via GET /v1/models
     */
    validate(baseUrl: string, apiKey: string): Promise<ValidationResult>;
    private emitError;
}
//# sourceMappingURL=openrouter.d.ts.map