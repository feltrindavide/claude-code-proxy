/**
 * Thinking filter — controls how thinking blocks flow through the SSE pipeline.
 *
 * Per-tier and per-provider modes:
 *   passthrough — leave thinking blocks unchanged
 *   strip       — drop thinking blocks entirely (tracking indices to avoid leaks)
 *   transform   — convert reasoning_content deltas into thinking_delta events
 *   auto        — start in passthrough, switch to strip if no thinking within window
 *
 * The filter operates AFTER adapter.transformResponse(), so events are already
 * in Anthropic SSE format with assigned block indices.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThinkingMode = 'passthrough' | 'strip' | 'transform' | 'auto';

export interface TierThinkingConfig {
  mode: ThinkingMode;
}

export interface ThinkingOverrides {
  /** Glob patterns mapped to mode, e.g. { "deepseek/*": "transform", "ollama/*": "strip" } */
  [pattern: string]: ThinkingMode;
}

export interface ThinkingConfig {
  opus: TierThinkingConfig;
  sonnet: TierThinkingConfig;
  haiku: TierThinkingConfig;
  overrides: ThinkingOverrides;
}

const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  opus: { mode: 'passthrough' },
  sonnet: { mode: 'auto' },
  haiku: { mode: 'strip' },
  overrides: {},
};

// ---------------------------------------------------------------------------
// ThinkingBlockTracker — tracks which content block indices are thinking blocks
// ---------------------------------------------------------------------------

export class ThinkingBlockTracker {
  private thinkingIndices = new Set<number>();

  /** Mark an index as belonging to a thinking block */
  markAsThinking(index: number): void {
    this.thinkingIndices.add(index);
  }

  /** Check if an index belongs to a thinking block */
  isThinkingIndex(index: number): boolean {
    return this.thinkingIndices.has(index);
  }

  /** Remove tracking for a closed thinking block */
  removeIndex(index: number): void {
    this.thinkingIndices.delete(index);
  }

  /** True if any thinking block has been seen */
  get hasSeenThinking(): boolean {
    return this.thinkingIndices.size > 0;
  }

  reset(): void {
    this.thinkingIndices.clear();
  }
}

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the thinking mode for a given tier and target model.
 * Preference: override match > tier config > default (passthrough).
 */
export function resolveThinkingMode(
  tier: string | undefined,
  targetModel: string,
  config?: Partial<ThinkingConfig>,
): ThinkingMode {
  const cfg = { ...DEFAULT_THINKING_CONFIG, ...config };

  // Check overrides first (glob-style matching)
  if (cfg.overrides && targetModel) {
    for (const [pattern, mode] of Object.entries(cfg.overrides)) {
      if (targetModel.toLowerCase().includes(pattern.replace('*', '').toLowerCase())) {
        return mode;
      }
    }
  }

  // Fall back to tier config
  if (tier === 'opus') return cfg.opus?.mode || 'passthrough';
  if (tier === 'fable') return cfg.opus?.mode || 'passthrough';
  if (tier === 'sonnet') return cfg.sonnet?.mode || 'passthrough';
  if (tier === 'haiku') return cfg.haiku?.mode || 'strip';

  return 'passthrough';
}

// ---------------------------------------------------------------------------
// SSE event filter
// ---------------------------------------------------------------------------

/**
 * Filter a single SSE event based on the thinking mode.
 * Returns the (possibly modified) event string, or null to drop it.
 */
export function filterThinkingEvent(
  event: string,
  mode: ThinkingMode,
  tracker: ThinkingBlockTracker,
  autoState?: { switchedToStrip: boolean },
): string | null {
  // Always pass through if passthrough (unless auto switched to strip)
  if (mode === 'passthrough' || (mode === 'auto' && autoState?.switchedToStrip === false)) {
    // Still need to track thinking blocks for auto mode detection
    if (mode === 'auto') {
      const dataMatch = event.match(/^data: (.+)$/m);
      if (dataMatch) {
        try {
          const parsed = JSON.parse(dataMatch[1]);
          if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'thinking') {
            tracker.markAsThinking(parsed.index);
          }
        } catch {}
      }
    }
    return event;
  }

  // Extract data from SSE event
  const dataMatch = event.match(/^data: (.+)$/m);
  if (!dataMatch) return event; // Non-data event (e.g., empty lines), pass through

  let parsed: any;
  try {
    parsed = JSON.parse(dataMatch[1]);
  } catch {
    return event; // Can't parse, pass through
  }

  // Handle transform mode: convert reasoning_content deltas to thinking_delta
  if (mode === 'transform') {
    if (parsed.type === 'content_block_delta' && parsed.delta?.reasoning_content) {
      // Rewrite the event as a thinking_delta
      parsed.delta = { type: 'thinking_delta', thinking: parsed.delta.reasoning_content };
      return `event: content_block_delta\ndata: ${JSON.stringify(parsed)}\n\n`;
    }
  }

  // Handle strip (or auto that switched to strip)
  if (mode === 'strip' || (mode === 'auto' && autoState?.switchedToStrip)) {
    // Track thinking block starts so we can drop their deltas and stops
    if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'thinking') {
      tracker.markAsThinking(parsed.index);
      return null; // Drop the start event
    }

    // Drop deltas for thinking blocks
    if (parsed.type === 'content_block_delta' && tracker.isThinkingIndex(parsed.index)) {
      return null;
    }

    // Drop stops for thinking blocks
    if (parsed.type === 'content_block_stop' && tracker.isThinkingIndex(parsed.index)) {
      tracker.removeIndex(parsed.index);
      return null;
    }
  }

  return event;
}

// ---------------------------------------------------------------------------
// Auto-mode detector
// ---------------------------------------------------------------------------

/**
 * Auto mode state machine: starts in passthrough, monitors first N events.
 * If no thinking block is seen within the window, switches to strip.
 */
export class AutoModeDetector {
  private eventsObserved = 0;
  private _switchedToStrip = false;
  private readonly eventWindow: number;

  constructor(eventWindow = 10) {
    this.eventWindow = eventWindow;
  }

  /** Feed an event (already filtered) and check if we should switch mode */
  observe(event: string | null): void {
    if (this._switchedToStrip) return;

    const dataMatch = event?.match(/^data: (.+)$/m);
    if (!dataMatch) return;

    try {
      const parsed = JSON.parse(dataMatch[1]);
      // If we see a thinking block, stay in passthrough indefinitely
      if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'thinking') {
        this.eventsObserved = 0; // Reset — a thinking model was detected
        return;
      }
    } catch {}

    this.eventsObserved++;
    if (this.eventsObserved >= this.eventWindow) {
      this._switchedToStrip = true;
    }
  }

  get switchedToStrip(): boolean {
    return this._switchedToStrip;
  }

  reset(): void {
    this.eventsObserved = 0;
    this._switchedToStrip = false;
  }
}

export { DEFAULT_THINKING_CONFIG };
