'use client';

import { useContextStream } from '@/hooks/useContextStream';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function barColor(percent: number): string {
  if (percent >= 85) return 'bg-semantic-error';
  if (percent >= 70) return 'bg-amber-500';
  return 'bg-primary';
}

export function ContextGauge() {
  const { context, connected, error, retry } = useContextStream();

  const percent = Math.min(100, context?.usagePercent ?? 0);
  const displayPercent = context?.usagePercent ?? 0;
  const total = context?.totalTokens ?? 0;
  const limit = context?.limit ?? 0;

  const statusLabel = connected ? 'Live' : error ? 'Offline' : 'Connecting…';
  const statusClass = connected
    ? 'bg-green-500/10 text-semantic-success'
    : error
      ? 'bg-red-500/10 text-semantic-error'
      : 'bg-canvas-soft text-muted';

  return (
    <div className="bg-surface-card rounded-lg border border-hairline p-md">
      <div className="flex items-center justify-between mb-sm">
        <h3 className="font-heading text-[16px] text-ink">Context usage</h3>
        <div className="flex items-center gap-2">
          {error && (
            <button
              type="button"
              onClick={retry}
              className="text-[11px] text-primary hover:underline"
            >
              Retry
            </button>
          )}
          <span className={`text-[11px] font-medium rounded-pill px-2 py-0.5 ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="h-2.5 bg-canvas-soft rounded-full overflow-hidden mb-xs">
        <div
          className={`h-full transition-all duration-500 ${barColor(percent)}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex justify-between text-small text-muted">
        <span>
          {total > 0
            ? `${formatTokens(total)} / ${formatTokens(limit)} tokens (${displayPercent.toFixed(1)}%)`
            : 'No active session'}
        </span>
        {context?.tier && (
          <span className="font-mono text-[11px] uppercase">{context.tier}</span>
        )}
      </div>

      {context?.model && (
        <p className="text-[11px] text-muted font-mono mt-xs truncate">
          {context.provider}/{context.model}
        </p>
      )}
    </div>
  );
}
