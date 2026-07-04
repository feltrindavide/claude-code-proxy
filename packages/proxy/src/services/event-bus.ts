/**
 * Internal event bus for proxy lifecycle hooks and future plugins.
 */

import { EventEmitter } from 'events';
import type { ClaudeTier } from '../types/index.js';

export type ProxyEventMap = {
  'request.started': {
    requestId: string;
    model: string;
    provider?: string;
    tier?: ClaudeTier;
  };
  'request.completed': {
    requestId: string;
    status: 'success' | 'error';
    durationMs: number;
    provider: string;
    tier?: ClaudeTier;
    upstreamLatencyMs?: number;
  };
  'provider.error': {
    provider: string;
    error: string;
    requestId?: string;
    targetModel?: string;
  };
  'route.fallback': {
    fromProvider: string;
    toProvider: string;
    fromModel: string;
    toModel: string;
    reason: string;
    requestId?: string;
  };
  'config.reloaded': {
    timestamp: string;
  };
};

export type ProxyEventType = keyof ProxyEventMap;

class ProxyEventBus {
  private emitter = new EventEmitter();

  emit<T extends ProxyEventType>(type: T, payload: ProxyEventMap[T]): void {
    this.emitter.emit(type, payload);
    this.emitter.emit('*', { type, payload });
  }

  on<T extends ProxyEventType>(
    type: T,
    listener: (payload: ProxyEventMap[T]) => void,
  ): () => void {
    this.emitter.on(type, listener);
    return () => this.emitter.off(type, listener);
  }

  onAny(listener: (event: { type: ProxyEventType; payload: ProxyEventMap[ProxyEventType] }) => void): () => void {
    this.emitter.on('*', listener);
    return () => this.emitter.off('*', listener);
  }
}

export const eventBus = new ProxyEventBus();
