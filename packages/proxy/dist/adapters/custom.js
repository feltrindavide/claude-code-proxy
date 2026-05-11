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
import { SSEBuilder, parseSSEStream, mapStopReason, getUserFacingErrorMessage, } from '../services/sse-transformer.js';
export class CustomAdapter {
    providerType = 'custom';
    apiPath = '/v1/chat/completions';
    timeouts = { streaming: 120_000, nonStreaming: 30_000 };
    /**
     * Transform Anthropic messages → OpenAI chat/completions format
     * (Same as OpenCodeAdapter — generic OpenAI-compatible)
     */
    transformRequest(body, route) {
        const messages = body.messages.map((msg) => {
            const content = typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                    ? msg.content
                        .filter((b) => b.type === 'text')
                        .map((b) => b.text ?? '')
                        .join('\n')
                    : '';
            return {
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content,
            };
        });
        const result = {
            model: route.targetModel,
            messages,
            stream: true,
        };
        if (body.max_tokens !== undefined) {
            result.max_tokens = body.max_tokens;
        }
        if (body.temperature !== undefined) {
            result.temperature = body.temperature;
        }
        // Map Anthropic tools → OpenAI tools
        if (body.tools && body.tools.length > 0) {
            result.tools = body.tools.map((t) => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.input_schema,
                },
            }));
        }
        return result;
    }
    /**
     * Transform OpenAI SSE → Anthropic SSE via SSEBuilder
     * (Same as OpenCodeAdapter)
     */
    async *transformResponse(upstreamResponse, options) {
        if (!upstreamResponse.body) {
            yield this.emitError('Empty response body from provider');
            return;
        }
        const sse = new SSEBuilder(options.messageId, options.model, options.inputTokens);
        yield sse.message_start();
        try {
            for await (const event of parseSSEStream(upstreamResponse.body)) {
                // Skip [DONE] terminal event
                if (event.data === '[DONE]')
                    continue;
                let chunk;
                try {
                    chunk = JSON.parse(event.data);
                }
                catch {
                    continue; // Skip malformed chunks
                }
                const choice = chunk
                    .choices?.[0];
                if (!choice)
                    continue;
                const delta = choice.delta;
                const finishReason = choice.finish_reason;
                // Handle text content deltas
                if (delta?.content) {
                    for (const evt of sse.ensureTextBlock()) {
                        yield evt;
                    }
                    yield sse.emitTextDelta(delta.content);
                }
                // Handle tool call deltas
                if (delta?.tool_calls && delta.tool_calls.length > 0) {
                    for (const tc of delta.tool_calls) {
                        if (tc.id) {
                            // New tool call — emit content_block_start for tool_use
                            const toolIndex = tc.index ?? sse['blocks'].allocateIndex();
                            yield this.formatSSEEvent('content_block_start', {
                                type: 'content_block_start',
                                index: toolIndex,
                                content_block: {
                                    type: 'tool_use',
                                    id: tc.id,
                                    name: tc.function?.name ?? 'unknown',
                                    input: {},
                                },
                            });
                        }
                        // Emit input_json_delta for arguments fragment
                        if (tc.function?.arguments) {
                            const toolIndex = tc.index ?? 0;
                            yield this.formatSSEEvent('content_block_delta', {
                                type: 'content_block_delta',
                                index: toolIndex,
                                delta: {
                                    type: 'input_json_delta',
                                    partial_json: tc.function.arguments,
                                },
                            });
                        }
                    }
                }
                // Handle finish_reason — close stream
                if (finishReason) {
                    for (const evt of sse.closeContentBlocks()) {
                        yield evt;
                    }
                    yield sse.message_delta(mapStopReason(finishReason), 0);
                    yield sse.message_stop();
                    return;
                }
            }
        }
        catch (error) {
            // Mid-stream error — close blocks and emit error
            for (const evt of sse.closeContentBlocks()) {
                yield evt;
            }
            const userMsg = getUserFacingErrorMessage(error);
            yield sse.emitTopLevelError(userMsg);
            yield sse.message_delta('end_turn', 0);
            yield sse.message_stop();
            return;
        }
        // If stream ended without finish_reason, close gracefully
        for (const evt of sse.closeContentBlocks()) {
            yield evt;
        }
        yield sse.message_delta('end_turn', 0);
        yield sse.message_stop();
    }
    /**
     * Validate connectivity — GET /v1/models with POST /v1/chat/completions fallback
     */
    async validate(baseUrl, apiKey) {
        try {
            // Try GET /v1/models first
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
            // Fallback: POST /v1/chat/completions with minimal request
            const testResp = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'test',
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 1,
                }),
                signal: AbortSignal.timeout(10_000),
            });
            // 200 or 400 means endpoint works (400 = "test" model not found)
            if (testResp.ok || testResp.status === 400) {
                return { valid: true };
            }
            return { valid: false, error: `Validation failed: ${testResp.status}` };
        }
        catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    emitError(message) {
        return this.formatSSEEvent('error', {
            type: 'error',
            error: { type: 'api_error', message },
        });
    }
    formatSSEEvent(eventType, data) {
        return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    }
}
//# sourceMappingURL=custom.js.map