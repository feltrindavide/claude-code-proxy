'use client';
import { useProxyStore } from '@/stores/proxyStore';
import { Button } from '@/components/ui/Button';

export function ProxyControls() {
  const { status, isStarting, isStopping, startProxy, stopProxy } = useProxyStore();
  const isRunning = status === 'running';

  return (
    <div className="flex gap-md mt-lg">
      {!isRunning ? (
        <Button
          variant="primary"
          onClick={startProxy}
          loading={isStarting}
          loadingText="Starting proxy..."
        >
          Start Proxy
        </Button>
      ) : (
        <Button
          variant="destructive"
          onClick={stopProxy}
          loading={isStopping}
          loadingText="Stopping proxy..."
        >
          Stop Proxy
        </Button>
      )}
    </div>
  );
}
