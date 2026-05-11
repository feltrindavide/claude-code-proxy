import { create } from 'zustand';
import { fetchValidationResults, dismissValidationWarning } from '@/lib/api';

interface HealthState {
  validationResults: Record<string, { valid: boolean; error?: string; timestamp: string; dismissed?: boolean }>;
  dismissedWarnings: string[]; // Array (not Set) for serialization compatibility
  isLoading: boolean;
  pollValidation: () => Promise<void>;
  dismissWarning: (providerName: string) => Promise<void>;
  isProviderHealthy: (providerName: string) => boolean;
  getProviderError: (providerName: string) => string | undefined;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  validationResults: {},
  dismissedWarnings: [],
  isLoading: false,

  pollValidation: async () => {
    set({ isLoading: true });
    try {
      const results = await fetchValidationResults();
      set({ validationResults: results, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  dismissWarning: async (providerName: string) => {
    // Persist dismiss to backend (D-72)
    await dismissValidationWarning(providerName);
    set((state) => ({
      dismissedWarnings: [...state.dismissedWarnings, providerName],
    }));
  },

  isProviderHealthy: (providerName: string) => {
    const { validationResults, dismissedWarnings } = get();
    const result = validationResults[providerName];
    if (!result) return true; // no validation data = assume healthy
    if (result.dismissed || dismissedWarnings.includes(providerName)) return true; // dismissed = treat as healthy
    return result.valid;
  },

  getProviderError: (providerName: string) => {
    const { validationResults } = get();
    const result = validationResults[providerName];
    return result?.error;
  },
}));
