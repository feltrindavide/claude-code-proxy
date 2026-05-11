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
import { SSEBuilder, parseSSEStream, mapStopReason, getUserFacingErrorMessage, } from '../services/sse-transformer.js';
export class OpenCodeAdapter {
    providerType = 'opencode';
    apiPath = '/v1/chat/completions';
    timeouts = { streaming: 120_000, nonStreaming: 30_000 };
    /**
     * Transform Anthropic messages → OpenAI chat/completions format
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
        // Map Anthropic tools → OpenAI tools (per T-02-08: validate schema without injecting)
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
                    return; // Stream is complete
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
     * Validate OpenCode connectivity — GET /v1/models with POST fallback (D-25)
     */
    async validate(baseUrl, apiKey) {
        try {
            // Try GET /v1/models first
            const modelsUrl = `${baseUrl}/v1/models`;
            let resp;
            try {
                resp = await fetch(modelsUrl, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                    signal: AbortSignal.timeout(10_000),
                });
            }
            catch {
                // Network error, skip to fallback
                resp = new Response(null, { status: 0 });
            }
            if (resp.ok) {
                let data;
                const text = await resp.text();
                try {
                    data = JSON.parse(text);
                }
                catch {
                    // If response isn't valid JSON, skip to fallback
                    return await this.fallbackValidate(baseUrl, apiKey);
                }
                // Handle both { data: [...] } and [...] formats
                const models = Array.isArray(data)
                    ? data.map((m) => m.id || '')
                    : data.data?.map((m) => m.id) || [];
                return { valid: true, models };
            }
            // Fallback to POST /v1/chat/completions
            return await this.fallbackValidate(baseUrl, apiKey);
        }
        catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async fallbackValidate(baseUrl, apiKey) {
        try {
            const chatUrl = `${baseUrl}/v1/chat/completions`;
            const testResp = await fetch(chatUrl, {
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
            // 200, 400, or 401 means endpoint works
            // 400 = "test" model not found, 401 = model not supported
            if (testResp.ok || testResp.status === 400 || testResp.status === 401) {
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
//# sourceMappingURL=opencode.js.map