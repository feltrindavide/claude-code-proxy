'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { fetchOnboardingStatus } from '@/lib/api';
import { isRoute } from '@/lib/routes';
import { useProxyStore } from '@/stores/proxyStore';
import { useHealthStore } from '@/stores/healthStore';

interface AppShellProps {
  children: React.ReactNode;
}

const HEALTH_POLL_MS = 5000;

function OnboardingGate() {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const proxyStatus = useProxyStore((s) => s.status);

  useEffect(() => {
    if (isRoute(pathname, '/setup') || isRoute(pathname, '/popup')) {
      setChecking(false);
      return;
    }

    void (async () => {
      setChecking(true);
      try {
        if (proxyStatus !== 'running') {
          return;
        }
        const status = await fetchOnboardingStatus();
        if (!status.complete) {
          router.replace('/setup');
        }
      } catch {
        // proxy store handles offline state
      } finally {
        setChecking(false);
      }
    })();
  }, [pathname, router, proxyStatus]);

  if (checking && !isRoute(pathname, '/setup') && !isRoute(pathname, '/popup')) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80">
        <p className="text-body text-muted">Checking setup…</p>
      </div>
    );
  }

  if (proxyStatus !== 'running' && !isRoute(pathname, '/setup') && !isRoute(pathname, '/popup')) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-lg py-sm text-sm text-amber-800 dark:text-amber-200" role="status">
        Proxy offline — start the proxy to complete setup or manage routes.
      </div>
    );
  }

  return null;
}

function HealthPoller() {
  const pathname = usePathname();
  const checkHealth = useProxyStore((s) => s.checkHealth);
  const pollValidation = useHealthStore((s) => s.pollValidation);

  useEffect(() => {
    if (isRoute(pathname, '/popup')) return;

    void checkHealth();
    void pollValidation();
    const interval = setInterval(() => {
      void checkHealth();
      void pollValidation();
    }, HEALTH_POLL_MS);
    return () => clearInterval(interval);
  }, [pathname, checkHealth, pollValidation]);

  return null;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isSetup = isRoute(pathname, '/setup');
  const isPopup = isRoute(pathname, '/popup');

  if (isPopup) {
    return <>{children}</>;
  }

  return (
    <>
      <HealthPoller />
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
