import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventBus } from '../src/services/event-bus.js';

describe('event-bus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emits typed events to subscribers', () => {
    const listener = vi.fn();
    const off = eventBus.on('request.started', listener);

    eventBus.emit('request.started', {
      requestId: 'req-1',
      model: 'claude-opus-4-20250514',
      provider: 'openrouter',
      tier: 'opus',
    });

    expect(listener).toHaveBeenCalledWith({
      requestId: 'req-1',
      model: 'claude-opus-4-20250514',
      provider: 'openrouter',
      tier: 'opus',
    });

    off();
  });

  it('emits wildcard events', () => {
    const listener = vi.fn();
    const off = eventBus.onAny(listener);

    eventBus.emit('config.reloaded', { timestamp: '2026-01-01T00:00:00.000Z' });

    expect(listener).toHaveBeenCalledWith({
      type: 'config.reloaded',
      payload: { timestamp: '2026-01-01T00:00:00.000Z' },
    });

    off();
  });
});
