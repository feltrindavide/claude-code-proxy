import { create } from 'zustand';
import { fetchLogs, type RequestLogEntry } from '@/lib/api';

interface LogState {
  entries: RequestLogEntry[];
  isLoading: boolean;
  lastRefresh: Date | null;
  error: string | null;
  fetchLogs: () => Promise<void>;
}

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  isLoading: false,
  lastRefresh: null,
  error: null,
  fetchLogs: async () => {
    set({ isLoading: true, error: null });
    try {
      const entries = await fetchLogs();
      set({ entries, isLoading: false, lastRefresh: new Date() });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch logs', isLoading: false });
    }
  },
}));
