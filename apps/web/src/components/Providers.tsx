'use client';
import { ThemeProvider } from '@/stores/theme';
import { AppShell } from '@/components/AppShell';
import { ToastContainer } from '@/components/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AppShell>{children}</AppShell>
      <ToastContainer />
    </ThemeProvider>
  );
}
