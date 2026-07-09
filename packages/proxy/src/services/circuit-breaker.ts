/**
 * Circuit breaker per provider upstream.
 */

import { eventBus } from './event-bus.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000,
};

interface ProviderCircuit {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  halfOpenProbeInFlight: boolean;
}

export class CircuitBreakerService {
  private circuits = new Map<string, ProviderCircuit>();
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getOrCreate(providerName: string): ProviderCircuit {
    let c = this.circuits.get(providerName);
    if (!c) {
      c = { state: 'closed', consecutiveFailures: 0, openedAt: null, halfOpenProbeInFlight: false };
      this.circuits.set(providerName, c);
    }
    return c;
  }

  private transitionToOpen(providerName: string, c: ProviderCircuit): void {
    const wasClosed = c.state !== 'open';
    c.state = 'open';
    c.openedAt = Date.now();
    if (wasClosed) {
      eventBus.emit('circuit.open', { provider: providerName, timestamp: new Date().toISOString() });
    }
  }

  /** Check if requests should be allowed for this provider. */
  canRequest(providerName: string): boolean {
    const c = this.getOrCreate(providerName);
    if (c.state === 'closed') return true;

    if (c.state === 'open') {
      if (c.openedAt && Date.now() - c.openedAt >= this.config.cooldownMs) {
        c.state = 'half-open';
        c.halfOpenProbeInFlight = false;
        return true;
      }
      return false;
    }

    // half-open: allow a single probe request
    if (c.halfOpenProbeInFlight) return false;
    c.halfOpenProbeInFlight = true;
    return true;
  }

  getState(providerName: string): CircuitState {
    const c = this.getOrCreate(providerName);
    if (c.state === 'open' && c.openedAt && Date.now() - c.openedAt >= this.config.cooldownMs) {
      c.state = 'half-open';
    }
    return c.state;
  }

  recordSuccess(providerName: string): void {
    const c = this.getOrCreate(providerName);
    c.consecutiveFailures = 0;
    c.state = 'closed';
    c.openedAt = null;
    c.halfOpenProbeInFlight = false;
  }

  recordFailure(providerName: string): void {
    const c = this.getOrCreate(providerName);
    c.halfOpenProbeInFlight = false;
    if (c.state === 'half-open') {
      this.transitionToOpen(providerName, c);
      c.consecutiveFailures = this.config.failureThreshold;
      return;
    }
    c.consecutiveFailures++;
    if (c.consecutiveFailures >= this.config.failureThreshold) {
      this.transitionToOpen(providerName, c);
    }
  }

  getAllStates(): Map<string, CircuitState> {
    const out = new Map<string, CircuitState>();
    for (const [name] of this.circuits) {
      out.set(name, this.getState(name));
    }
    return out;
  }

  /** @internal test helper */
  resetForTests(): void {
    this.circuits.clear();
  }
}

export const circuitBreakerService = new CircuitBreakerService();
