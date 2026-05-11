/**
 * Custom proxy handler — replaces http-proxy-middleware passthrough
 * Phase: 02-sse-streaming-integration
 * Plan: 02-03, Task 2
 *
 * Per D-19: Custom SSE handler — intercept upstream SSE, transform to Anthropic events
 * Per D-21: Timeout: 120s streaming, 30s non-streaming
 * Per D-26: Anthropic-compatible error format
 * Per D-28: Log internally + user-friendly response
 *
 * Threat mitigations:
 * - T-02-10: emitAnthropicError sanitizes messages via getUserFacingErrorMessage()
 * - T-02-11: Uses resolution.provider.baseUrl from registry (not client request body)
 * - T-02-12: AbortController with per-adapter timeout
 */
import type { Request, Response } from 'express';
/**
 * Emit an Anthropic-compatible error SSE event and end the response
 * Per D-26: Anthropic error format
 * Per D-28: User-friendly message, full error logged internally
 */
declare function emitAnthropicError(res: Response, error: unknown): void;
/**
 * Handle incoming /v1/messages requests
 * Full transformation pipeline: resolve → transform → fetch → transform SSE → stream
 */
export declare function handleProxyRequest(req: Request, res: Response): Promise<void>;
export { emitAnthropicError };
//# sourceMappingURL=proxy.d.ts.map