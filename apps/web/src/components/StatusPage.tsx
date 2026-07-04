'use client';
import { useEffect, useState } from 'react';
import { useProxyStore } from '@/stores/proxyStore';
import { useHealthStore } from '@/stores/healthStore';
import { StatusDot } from '@/components/StatusDot';
import { StatusCard } from '@/components/StatusCard';
import { ProviderHealthCard } from '@/components/ProviderHealthCard';
import { ProxyControls } from '@/components/ProxyControls';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Network, GitCommit, Clock, Server, ClipboardCopy, Check } from 'lucide-react';
import { useLogStore } from '@/stores/logStore';
import { useLogStream } from '@/hooks/useLogStream';
import { useToast } from '@/components/Toast';

export function StatusPage() {
  const {
    status, port, version, startTime, providerCount,
    lastError, checkHealth,
  } = useProxyStore();
  const { pollValidation, validationResults } = useHealthStore();
  const { toast } = useToast();
  const logEntries = useLogStore((s) => s.entries);
  useLogStream();
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Initial health check on mount
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Poll every 5 seconds (per D-38)
  useEffect(() => {
    const interval = setInterval(() => {
      checkHealth();
    }, 5000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Poll validation results for provider health (5s interval)
  useEffect(() => {
    pollValidation();
    const interval = setInterval(pollValidation, 5000);
    return () => clearInterval(interval);
  }, [pollValidation]);

  // Retry toast detection (D-69)
  const [lastAckedRetryKey, setLastAckedRetryKey] = useState<string | null>(null);

  useEffect(() => {
    const retryEntry = logEntries.find((entry) => entry.retryCount && entry.retryCount > 0);
    if (retryEntry && retryEntry.timestamp !== lastAckedRetryKey) {
      toast(`Retrying request (attempt ${retryEntry.retryCount}/2)...`, 'warning');
      setLastAckedRetryKey(retryEntry.timestamp);
    }
  }, [logEntries, lastAckedRetryKey, toast]);

  // Compute uptime
  const uptime = startTime
    ? Math.floor((Date.now() - startTime.getTime()) / 1000)
    : null;
  const uptimeDisplay = uptime !== null
    ? `${Math.floor(uptime / 60)}m ${uptime % 60}s`
    : '—';

  // Compute provider health counts
  const healthEntries = Object.entries(validationResults);
  const totalCount = healthEntries.length;
  const healthyCount = healthEntries.filter(([, r]) => r.valid && !r.dismissed).length;

  // Status label and color
  const statusLabel = {
    running: 'Running',
    stopped: 'Stopped',
    error: 'Error',
    loading: 'Starting...',
  }[status];

  const statusColor = {
    running: 'text-semantic-success',
    stopped: 'text-muted',
    error: 'text-semantic-error',
    loading: 'text-primary',
  }[status];

  const showBanner = lastError && lastError !== dismissedError;

  const zshrcSnippet = `export ANTHROPIC_BASE_URL="http://localhost:3456"\nsource ~/.claude/claude-code-proxy/models.sh`;

  async function copyZshrcSnippet() {
    try {
      await navigator.clipboard.writeText(zshrcSnippet);
      setCopied(true);
      toast('Copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Failed to copy', 'error');
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Large status indicator */}
      <div className="flex items-center gap-md mb-2xl">
        <StatusDot state={status} size="lg" />
        <h2 className={`font-display text-[22px] ${statusColor}`}>
          {statusLabel}
        </h2>
      </div>

      {/* Error banner */}
      {showBanner && (
        <div className="mb-lg">
          <ErrorBanner
            message={lastError!}
            onDismiss={() => setDismissedError(lastError)}
          />
        </div>
      )}

      {/* Empty state when stopped */}
      {status === 'stopped' && (
        <div className="mb-lg p-lg bg-surface-card rounded-lg border border-hairline">
          <h3 className="font-heading text-[18px] text-ink mb-xs">
            Proxy not responding
          </h3>
          <p className="text-body">
            The proxy server is not reachable. Try starting it from the sidebar.
          </p>
        </div>
      )}

      {/* Metric cards grid */}
      <div className="grid grid-cols-2 gap-md mb-lg">
        <StatusCard
          label="Port"
          value={port?.toString() || '—'}
          icon={Network}
        />
        <StatusCard
          label="Version"
          value={version || '—'}
          icon={GitCommit}
        />
        <StatusCard
          label="Uptime"
          value={uptimeDisplay}
          icon={Clock}
        />
        <StatusCard
          label="Providers"
          value={providerCount.toString()}
          icon={Server}
        />
        {totalCount > 0 && (
          <ProviderHealthCard healthyCount={healthyCount} totalCount={totalCount} />
        )}
      </div>

      {/* Start/Stop controls */}
      <ProxyControls />

      {/* Shell configuration — style like Claude/ChatGPT code blocks */}
      <div className="mt-xl bg-surface-card rounded-lg border border-hairline overflow-hidden">
        <div className="flex items-center justify-between px-md py-sm border-b border-hairline">
          <div className="flex items-center gap-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-semantic-error" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-semantic-success" />
            <span className="text-small text-muted ml-sm font-mono">~/.zshrc</span>
          </div>
          <button
            onClick={copyZshrcSnippet}
            className="inline-flex items-center gap-xs text-small text-muted hover:text-ink bg-canvas-soft hover:bg-surface-strong rounded-md px-sm py-xxs transition-colors focus-ring"
            aria-label="Copy to clipboard"
          >
            {copied ? (
              <><Check className="w-3.5 h-3.5 text-semantic-success" /> Copied</>
            ) : (
              <><ClipboardCopy className="w-3.5 h-3.5" /> Copy</>
            )}
          </button>
        </div>
        <div className="p-md bg-[#1e1e1e] overflow-x-auto">
          <pre className="text-small font-mono leading-relaxed text-[#d4d4d4]">
            <span className="text-[#6a9955]"># Proxy locale — gestione API Key e routing modelli</span>{'\n'}
            <span className="text-[#569cd6]">export </span>
            <span className="text-[#9cdcfe]">ANTHROPIC_BASE_URL</span>
            <span className="text-[#d4d4d4]">=</span>
            <span className="text-[#ce9178]">"http://localhost:3456"</span>{'\n'}
            {'\n'}
            <span className="text-[#6a9955]"># Modelli configurati (auto-aggiornati dal proxy)</span>{'\n'}
            <span className="text-[#569cd6]">source </span>
            <span className="text-[#ce9178]">~/.claude/claude-code-proxy/models.sh</span>
          </pre>
        </div>
      </div>
    </div>
  );
}
