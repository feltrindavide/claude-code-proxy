/**
 * Anthropic Messages API fields that must not be forwarded to OpenAI-compatible
 * chat/completions endpoints (NVIDIA NIM, DeepSeek, etc.).
 */
const ANTHROPIC_ONLY_CHAT_FIELDS = [
  'context_management',
  'metadata',
  'system',
  'thinking',
  'container',
  'service_tier',
] as const;

/** Remove Anthropic-only request fields before upstream OpenAI chat/completions fetch. */
export function stripAnthropicOnlyChatFields(body: Record<string, unknown>): void {
  for (const key of ANTHROPIC_ONLY_CHAT_FIELDS) {
    delete body[key];
  }
}
