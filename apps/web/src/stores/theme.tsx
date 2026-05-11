'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'cursor' | 'claude';

interface ThemeContextType {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeCtx = createContext<ThemeContextType>({
  theme: 'cursor',
  toggle: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('cursor');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('ccp-theme') as Theme | null;
    if (saved === 'cursor' || saved === 'claude') {
      setThemeState(saved);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ccp-theme', theme);
  }, [theme, mounted]);

  const toggle = useCallback(() => {
    setThemeState(prev => prev === 'cursor' ? 'claude' : 'cursor');
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, toggle, setTheme: setThemeState }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
