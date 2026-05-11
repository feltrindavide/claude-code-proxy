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
import { createParser } from 'eventsource-parser';
export class OpenRouterAdapter {
    providerType = 'openrouter';
    apiPath = '/v1/messages';
    timeouts = { streaming: 120_000, nonStreaming: 30_000 };
    /**
     * OpenRouter supports native Anthropic endpoint — passthrough with stream flag
     */
    transformRequest(body, route) {
        return {
            ...body,
            model: route.targetModel, // Use mapped model, not the original
            stream: true,
        };
    }
    /**
     * OpenRouter returns native Anthropic SSE — pass through with [DONE] filtering
     */
    async *transformResponse(upstreamResponse, _options) {
        if (!upstreamResponse.body) {
            yield this.emitError('Empty response body from provider');
            return;
        }
        const reader = upstreamResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const events = [];
        const parser = createParser({
            onEvent: (event) => {
                // Filter out terminal noise events
                if (event.data === '[DONE]')
                    return;
                const eventType = event.event || 'message';
                events.push(`event: ${eventType}\ndata: ${event.data}\n\n`);
            },
        });
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (buffer.trim()) {
                    parser.feed(buffer);
                }
                for (const evt of events.splice(0)) {
                    yield evt;
                }
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            parser.feed(buffer);
            buffer = '';
            for (const evt of events.splice(0)) {
                yield evt;
            }
        }
    }
    /**
     * Validate OpenRouter connectivity via GET /v1/models
     */
    async validate(baseUrl, apiKey) {
        try {
            const resp = await fetch(`${baseUrl}/v1/models`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(10_000),
            });
            if (resp.ok) {
                const data = (await resp.json());
                return {
                    valid: true,
                    models: data.data?.map((m) => m.id),
                };
            }
            return { valid: false, error: `Validation failed: ${resp.status}` };
        }
        catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    emitError(message) {
        return `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message } })}\n\n`;
    }
}
//# sourceMappingURL=openrouter.js.map