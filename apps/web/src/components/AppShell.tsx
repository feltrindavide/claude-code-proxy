'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { fetchOnboardingStatus, checkHealth } from '@/lib/api';

interface AppShellProps {
  children: React.ReactNode;
}

function OnboardingGate() {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [proxyOffline, setProxyOffline] = useState(false);

  useEffect(() => {
    if (pathname === '/setup') {
      setChecking(false);
      return;
    }

    void (async () => {
      setChecking(true);
      try {
        const health = await checkHealth();
        if (!health.running) {
          setProxyOffline(true);
          return;
        }
        setProxyOffline(false);
        const status = await fetchOnboardingStatus();
        if (!status.complete) {
          router.replace('/setup');
        }
      } catch {
        setProxyOffline(true);
      } finally {
        setChecking(false);
      }
    })();
  }, [pathname, router]);

  if (checking && pathname !== '/setup') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80">
        <p className="text-body text-muted">Checking setup…</p>
      </div>
    );
  }

  if (proxyOffline && pathname !== '/setup') {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-lg py-sm text-sm text-amber-800 dark:text-amber-200">
        Proxy offline — start the proxy to complete setup or manage routes.
      </div>
    );
  }

  return null;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isSetup = pathname === '/setup';

  return (
    <>
      <OnboardingGate />
      {isSetup ? (
        <main className="min-h-screen bg-canvas p-lg">{children}</main>
      ) : (
        <div className="flex min-h-screen bg-canvas">
          <Sidebar />
          <main className="flex-1 bg-canvas p-lg">{children}</main>
        </div>
      )}
    </>
  );
}
