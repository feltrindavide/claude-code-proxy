/**
 * Local provider discovery — auto-detect Ollama, LM Studio, and llama.cpp.
 *
 * At startup and periodically, scans well-known endpoints for local providers.
 * Detected providers are registered with autoDiscovered: true so they can be
 * used in model routing but won't overwrite manually-configured providers.
 */

import { upstreamFetch } from './upstream-http.js';

// ---------------------------------------------------------------------------
// Detector interface
// ---------------------------------------------------------------------------

export interface DetectedModel {
  id: string;
}

export interface DetectorResult {
  name: string;
  defaultBaseUrl: string;
  providerType: string;
  models: string[];
}

export interface ProviderDetector {
  name: string;
  defaultBaseUrl: string;
  providerType: string;
  detect(): Promise<boolean>;
  fetchModels(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Ollama detector
// ---------------------------------------------------------------------------

class OllamaDetector implements ProviderDetector {
  readonly name = 'Ollama';
  readonly defaultBaseUrl = 'http://localhost:11434';
  readonly providerType = 'ollama';

  async detect(): Promise<boolean> {
    try {
      const resp = await upstreamFetch(`${this.defaultBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!resp.ok) return false;
      const body = (await resp.json()) as any;
      return Array.isArray(body.models);
    } catch {
      return false;
    }
  }

  async fetchModels(): Promise<string[]> {
    try {
      const resp = await upstreamFetch(`${this.defaultBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) return [];
      const body = (await resp.json()) as any;
      if (!Array.isArray(body.models)) return [];
      return body.models.map((m: any) => m.name).filter(Boolean);
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// LM Studio detector (OpenAI-compatible /v1/models)
// ---------------------------------------------------------------------------

class LMStudioDetector implements ProviderDetector {
  readonly name = 'LM Studio';
  readonly defaultBaseUrl = 'http://localhost:1234';
  readonly providerType = 'custom';

  async detect(): Promise<boolean> {
    try {
      const resp = await upstreamFetch(`${this.defaultBaseUrl}/v1/models`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!resp.ok) return false;
      const body = (await resp.json()) as any;
      return Array.isArray(body.data);
    } catch {
      return false;
    }
  }

  async fetchModels(): Promise<string[]> {
    try {
      const resp = await upstreamFetch(`${this.defaultBaseUrl}/v1/models`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) return [];
      const body = (await resp.json()) as any;
      if (!Array.isArray(body.data)) return [];
      return body.data.map((m: any) => m.id).filter(Boolean);
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// llama.cpp detector (OpenAI-compatible /v1/models)
// ---------------------------------------------------------------------------

class LlamaCppDetector implements ProviderDetector {
  readonly name = 'llama.cpp';
  readonly defaultBaseUrl = 'http://localhost:8080';
  readonly providerType = 'custom';

  async detect(): Promise<boolean> {
    try {
      const resp = await upstreamFetch(`${this.defaultBaseUrl}/v1/models`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!resp.ok) return false;
      const body = (await resp.json()) as any;
      return Array.isArray(body.data);
    } catch {
      return false;
    }
  }

  async fetchModels(): Promise<string[]> {
    try {
      const resp = await upstreamFetch(`${this.defaultBaseUrl}/v1/models`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) return [];
      const body = (await resp.json()) as any;
      if (!Array.isArray(body.data)) return [];
      return body.data.map((m: any) => m.id).filter(Boolean);
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Discovery config
// ---------------------------------------------------------------------------

export interface LocalDiscoveryConfig {
  enabled: boolean;
  ollama: boolean;
  lmStudio: boolean;
  llamaCpp: boolean;
  intervalMs: number;
}

const DEFAULT_DISCOVERY_CONFIG: LocalDiscoveryConfig = {
  enabled: true,
  ollama: true,
  lmStudio: true,
  llamaCpp: true,
  intervalMs: 300_000,
};

// ---------------------------------------------------------------------------
// Discovery service
// ---------------------------------------------------------------------------

export type ProviderRegistrar = (provider: {
  name: string;
  baseUrl: string;
  providerType: string;
  models: string[];
  enabled: boolean;
  priority: number;
  autoDiscovered: boolean;
}) => void;

export class LocalDiscoveryService {
  private detectors: ProviderDetector[] = [
    new OllamaDetector(),
    new LMStudioDetector(),
    new LlamaCppDetector(),
  ];
  private config: LocalDiscoveryConfig;
  private intervalId?: ReturnType<typeof setInterval>;
  private registrar: ProviderRegistrar;
  private discovered = new Map<string, { reachable: boolean }>();

  constructor(registrar: ProviderRegistrar, config?: Partial<LocalDiscoveryConfig>) {
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
    this.registrar = registrar;
  }

  /** Update runtime config */
  reconfigure(config: Partial<LocalDiscoveryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Get current config */
  getConfig(): LocalDiscoveryConfig {
    return { ...this.config };
  }

  /** Get discovered providers with reachability status */
  getDiscoveredProviders(): Array<{ name: string; reachable: boolean }> {
    return Array.from(this.discovered.entries()).map(([name, state]) => ({
      name,
      reachable: state.reachable,
    }));
  }

  /** Run a single scan cycle */
  async scan(): Promise<void> {
    if (!this.config.enabled) return;

    for (const detector of this.detectors) {
      // Check if this detector is enabled using a name-to-key map
      const detectorKeyMap: Record<string, keyof LocalDiscoveryConfig> = {
        ollama: 'ollama',
        'lm studio': 'lmStudio',
        'llama.cpp': 'llamaCpp',
      };
      const key = detectorKeyMap[detector.name.toLowerCase()] || ('ollama' as keyof LocalDiscoveryConfig);
      if (key === 'enabled' || key === 'intervalMs') continue;
      const enabled = this.config[key];
      if (enabled === false) continue;

      try {
        const available = await detector.detect();
        if (available) {
          const models = await detector.fetchModels();

          // Register or update
          this.registrar({
            name: detector.name,
            baseUrl: detector.defaultBaseUrl,
            providerType: detector.providerType,
            models,
            enabled: true,
            priority: 500,
            autoDiscovered: true,
          });

          this.discovered.set(detector.name, { reachable: true });
          console.log(`[Discovery] ${detector.name}: ${models.length} models`);
        } else {
          // Mark as unreachable but keep in map
          this.discovered.set(detector.name, { reachable: false });
        }
      } catch (err) {
        this.discovered.set(detector.name, { reachable: false });
      }
    }
  }

  /** Start periodic scanning */
  start(): void {
    this.scan(); // Immediate first scan
    this.intervalId = setInterval(() => this.scan(), this.config.intervalMs);
  }

  /** Stop periodic scanning */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
