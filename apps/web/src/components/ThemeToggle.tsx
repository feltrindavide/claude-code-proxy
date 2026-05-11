'use client';
import { useTheme } from '@/stores/theme';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="w-full flex items-center gap-xs px-md py-xs text-body hover:bg-canvas-soft focus-ring rounded-md transition-colors text-sm"
      aria-label={`Switch to ${theme === 'cursor' ? 'Claude' : 'Cursor'} theme`}
    >
      {theme === 'cursor' ? (
        <Sun className="w-4 h-4 text-muted" aria-hidden="true" />
      ) : (
        <Moon className="w-4 h-4 text-muted" aria-hidden="true" />
      )}
      <span>{theme === 'cursor' ? 'Light Theme' : 'Dark Theme'}</span>
    </button>
  );
}
