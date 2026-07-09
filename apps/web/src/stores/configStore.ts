import { create } from 'zustand';
import { fetchProviders, fetchRoutes, saveRoutes } from '@/lib/api';
import type { z } from 'zod';
import type { RouteEntrySchema } from '@/lib/schemas';

type RouteEntry = z.infer<typeof RouteEntrySchema>;

export interface ConfigProvider {
  name: string;
  baseUrl: string;
  keyId: string;
  keyMask: string | null;
  models: string[];
  enabled: boolean;
  priority: number;
  providerType?: string;
  autoDiscovered?: boolean;
}

interface ConfigState {
  providers: ConfigProvider[];
  routes: RouteEntry[];
  subagentModel: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setRoutes: (routes: RouteEntry[]) => void;
  persistRoutes: (routes: RouteEntry[], subagentModel?: string) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  providers: [],
  routes: [],
  subagentModel: '',
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [providers, routeData] = await Promise.all([
        fetchProviders(),
        fetchRoutes(),
      ]);
      set({
        providers,
        routes: routeData.routes,
        subagentModel: routeData.subagentModel || '',
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load config',
      });
    }
  },

  setRoutes: (routes) => set({ routes }),

  persistRoutes: async (routes, subagentModel) => {
    const sub = subagentModel ?? get().subagentModel;
    await saveRoutes(routes, sub || undefined);
    set({ routes, subagentModel: sub });
  },
}));
