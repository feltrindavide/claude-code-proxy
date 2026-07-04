import { create } from 'zustand';
import { fetchLogs, type RequestLogEntry } from '@/lib/api';

interface LogState {
  entries: RequestLogEntry[];
  isLoading: boolean;
  lastRefresh: Date | null;
  error: string | null;
  wsConnected: boolean;
  fetchLogs: () => Promise<void>;
  addEntry: (entry: RequestLogEntry) => void;
  setEntries: (entries: RequestLogEntry[]) => void;
  setWsConnected: (connected: boolean) => void;
}

const MAX_ENTRIES = 50;

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  isLoading: false,
  lastRefresh: null,
  error: null,
  wsConnected: false,
  fetchLogs: async () => {
    set({ isLoading: true, error: null });
    try {
      const entries = await fetchLogs();
      set({ entries, isLoading: false, lastRefresh: new Date() });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch logs',
        isLoading: false,
      });
    }
  },
  addEntry: (entry) =>
    set((state) => {
      const exists = state.entries.some(
        (e) => e.timestamp === entry.timestamp && e.requestModel === entry.requestModel,
      );
      if (exists) return state;
      const entries = [entry, ...state.entries].slice(0, MAX_ENTRIES);
      return { entries, lastRefresh: new Date() };
    }),
  setEntries: (entries) => set({ entries, lastRefresh: new Date() }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
}));
