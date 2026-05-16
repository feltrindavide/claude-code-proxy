/**
 * ProviderAdapter interface — contract for all provider-specific adapters
 * Phase: 02-sse-streaming-integration
 * Plan: 02-01
 *
 * Per D-15: Provider-specific adapters for each provider type
 * Per D-16: Bidirectional transforms: transformRequest() + transformResponse()
 * Per D-17: Adapters at packages/proxy/src/adapters/{provider}.ts
 * Per D-18: Interface-based design
 * Per D-21: Timeouts: 120s streaming / 30s non-streaming, per-provider configurable
 */

import type { RouteResolution } from '../types/index.js';

/**
 * Anthropic messages API request body shape
 */
export interface AnthropicMessagesBody {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  system?: string | Array<{ type: string; text: string }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  /** OpenCode/OpenAI context management (compact prompts, etc.) */
  context_management?: Array<{
    type: 'compact' | 'truncation';
    priority?: number;
    maxTokens?: number;
  }>;
}

/**
 * Options passed to transformResponse() for SSE event generation
 */
export interface TransformOptions {
  messageId: string;
  model: string;
  inputTokens: number;
  requestId?: string;
  /** Whether the original request had thinking.type === 'enabled' (high-effort mode) */
  thinkingEnabled?: boolean;
}

/**
 * Result of provider connectivity validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  models?: string[];
  /** Model context windows discovered during validation, keyed by model ID */
  modelContexts?: Record<string, { context: number; max_output: number }>;
}

/**
 * ProviderAdapter — each provider implements this interface
 * to handle bidirectional format transformation and validation
 */
export interface ProviderAdapter {
  /** Provider type identifier (e.g., 'openrouter', 'opencode') */
  readonly providerType: string;

  /** API path for chat completions (e.g., '/v1/messages' for Anthropic, '/v1/chat/completions' for OpenAI) */
  readonly apiPath: string;

  /** Per-provider timeout config (ms) — per D-21 */
  timeouts: { streaming: number; nonStreaming: number };

  /** Transform Anthropic-format request body to provider format */
  transformRequest(
    anthropicBody: AnthropicMessagesBody,
    route: RouteResolution,
  ): Record<string, unknown>;

  /** Transform provider SSE response stream to Anthropic SSE events */
  transformResponse(
    upstreamResponse: Response,
    options: TransformOptions,
  ): AsyncIterable<string>;

  /** Validate provider connectivity */
  validate(baseUrl: string, apiKey: string): Promise<ValidationResult>;
}
