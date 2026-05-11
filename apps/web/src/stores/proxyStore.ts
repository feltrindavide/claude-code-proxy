import { create } from 'zustand';
import { checkHealth, startProxy, stopProxy, getProviderCount } from '@/lib/api';

interface ProxyState {
  status: 'running' | 'stopped' | 'error' | 'loading';
  port: number | null;
  version: string | null;
  startTime: Date | null;
  providerCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  isStarting: boolean;
  isStopping: boolean;
  checkHealth: () => Promise<void>;
  startProxy: () => Promise<void>;
  stopProxy: () => Promise<void>;
}

export const useProxyStore = create<ProxyState>((set, get) => ({
  status: 'loading',
  port: null,
  version: null,
  startTime: null,
  providerCount: 0,
  consecutiveFailures: 0,
  lastError: null,
  isStarting: false,
  isStopping: false,

  checkHealth: async () => {
    const health = await checkHealth();
    const providerCount = await getProviderCount();

    if (health.running) {
      set((state) => ({
        status: 'running',
        port: health.port,
        version: health.version,
        startTime: state.startTime || new Date(),
        providerCount,
        consecutiveFailures: 0,
        lastError: null,
      }));
    } else {
      set((state) => {
        const newFailures = state.consecutiveFailures + 1;
        return {
          status: newFailures >= 3 ? 'error' : 'stopped',
          consecutiveFailures: newFailures,
          providerCount,
          lastError: health.status === 'error' ? 'Health check returned error' : null,
        };
      });
    }
  },

  startProxy: async () => {
    set({ isStarting: true, lastError: null });
    const result = await startProxy();
    if (result.success) {
      set({ isStarting: false, status: 'loading', consecutiveFailures: 0 });
      // Health polling will detect the running proxy
      await get().checkHealth();
    } else {
      set({
        isStarting: false,
        status: 'error',
        lastError: result.error || 'Failed to start proxy',
      });
    }
  },

  stopProxy: async () => {
    set({ isStopping: true, lastError: null });
    const result = await stopProxy();
    if (result.success) {
      set({
        isStopping: false,
        status: 'stopped',
        port: null,
        version: null,
        startTime: null,
        providerCount: 0,
        consecutiveFailures: 0,
      });
    } else {
      set({
        isStopping: false,
        status: 'error',
        lastError: result.error || 'Failed to stop proxy',
      });
    }
  },
}));
