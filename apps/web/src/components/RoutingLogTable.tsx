'use client';
import { useState, useMemo } from 'react';
import { useLogStore } from '@/stores/logStore';
import { useLogStream } from '@/hooks/useLogStream';
import { replayRequest } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';

type SortDirection = 'asc' | 'desc' | null;
type SortKey = 'timestamp' | 'claudeTier' | 'providerName' | 'requestModel' | 'status' | 'durationMs';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export function RoutingLogTable() {
  const { entries, isLoading, lastRefresh, error, fetchLogs, wsConnected } = useLogStore();
  const { toast } = useToast();
  useLogStream();
  const [sort, setSort] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' });
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterTier, setFilterTier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Get unique providers for filter dropdown
  const providers = useMemo(() => {
    const set = new Set(entries.map(e => e.providerName).filter(Boolean));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = entries.filter(e =>
    (filterProvider === 'all' || e.providerName === filterProvider) &&
    (filterTier === 'all' || e.claudeTier === filterTier) &&
    (filterStatus === 'all' || e.status === filterStatus)
  );

  const sorted = [...filtered].sort((a, b) => {
    if (!sort.direction) return 0;
    const aVal = a[sort.key];
    const bVal = b[sort.key];
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: SortKey) => {
    setSort(prev => ({
      key,
      direction: prev.key === key
        ? (prev.direction === 'asc' ? 'desc' : prev.direction === 'desc' ? null : 'asc')
        : 'asc',
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sort.key !== columnKey) return null;
    if (sort.direction === 'asc') return <ArrowUp className="w-3 h-3 inline ml-1" />;
    if (sort.direction === 'desc') return <ArrowDown className="w-3 h-3 inline ml-1" />;
    return null;
  };

  return (
    <div>
      <h1 className="font-display text-[22px] text-ink mb-lg">Routing Log</h1>

      {/* Filter bar */}
      <div className="flex gap-xs mb-md flex-wrap items-center">
        <select
          value={filterProvider}
          onChange={e => setFilterProvider(e.target.value)}
          className="bg-surface-card border border-hairline rounded-md text-sm text-ink px-xs py-xs"
          aria-label="Filter by provider"
        >
          <option value="all">All Providers</option>
          {providers.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={filterTier}
          onChange={e => setFilterTier(e.target.value)}
          className="bg-surface-card border border-hairline rounded-md text-sm text-ink px-xs py-xs"
          aria-label="Filter by tier"
        >
          <option value="all">All Tiers</option>
          <option value="opus">Opus</option>
          <option value="sonnet">Sonnet</option>
          <option value="haiku">Haiku</option>
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-surface-card border border-hairline rounded-md text-sm text-ink px-xs py-xs"
          aria-label="Filter by status"
        >
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>

        {/* Refresh info */}
        <div className="flex items-center gap-xs ml-auto text-sm text-muted">
          <span
            className={`inline-flex items-center gap-1 ${wsConnected ? 'text-semantic-success' : 'text-muted'}`}
            title={wsConnected ? 'WebSocket live' : 'Polling fallback'}
          >
            <span
              className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-semantic-success animate-pulse' : 'bg-muted'}`}
            />
            {wsConnected ? 'Live' : 'Polling'}
          </span>
          {lastRefresh && (
            <span>Updated {lastRefresh.toLocaleTimeString()}</span>
          )}
          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="text-muted hover:text-ink focus-ring disabled:opacity-50"
            aria-label="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <p className="text-semantic-error text-sm mb-md">{error}</p>
      )}

      {/* Empty state */}
      {sorted.length === 0 && !isLoading && !error && (
        <p className="text-muted text-sm">No requests logged yet. Requests will appear here after Claude Code uses the proxy.</p>
      )}

      {/* Loading state */}
      {isLoading && entries.length === 0 && (
        <p className="text-muted text-sm">Loading logs...</p>
      )}

      {/* Table */}
      {sorted.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left text-muted font-medium border-b border-hairline py-xs">
                <button onClick={() => handleSort('timestamp')} className="focus-ring">
                  Timestamp <SortIcon columnKey="timestamp" />
                </button>
              </th>
              <th className="text-left text-muted font-medium border-b border-hairline py-xs">
                <button onClick={() => handleSort('claudeTier')} className="focus-ring">
                  Claude Tier <SortIcon columnKey="claudeTier" />
                </button>
              </th>
              <th className="text-left text-muted font-medium border-b border-hairline py-xs">
                <button onClick={() => handleSort('providerName')} className="focus-ring">
                  Provider <SortIcon columnKey="providerName" />
                </button>
              </th>
              <th className="text-left text-muted font-medium border-b border-hairline py-xs">
                <button onClick={() => handleSort('requestModel')} className="focus-ring">
                  Model <SortIcon columnKey="requestModel" />
                </button>
              </th>
              <th className="text-left text-muted font-medium border-b border-hairline py-xs">
                <button onClick={() => handleSort('status')} className="focus-ring">
                  Status <SortIcon columnKey="status" />
                </button>
              </th>
              <th className="text-left text-muted font-medium border-b border-hairline py-xs">
                <button onClick={() => handleSort('durationMs')} className="focus-ring">
                  Duration <SortIcon columnKey="durationMs" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => (
              <tr key={i} className="hover:bg-canvas-soft">
                <td className="py-xs border-b border-hairline-soft">
                  {new Date(e.timestamp).toLocaleString()}
                </td>
                <td className="py-xs border-b border-hairline-soft">
                  {e.claudeTier?.toUpperCase() || '—'}
                </td>
                <td className="py-xs border-b border-hairline-soft">
                  {e.providerName || '—'}
                </td>
                <td className="py-xs border-b border-hairline-soft">
                  {e.targetModel || e.requestModel || '—'}
                </td>
                <td className={`py-xs border-b border-hairline-soft ${e.status === 'success' ? 'text-semantic-success' : 'text-semantic-error'}`}>
                  {e.status}
                </td>
                <td className="py-xs border-b border-hairline-soft">
                  {e.durationMs}ms
                  {e.requestBodyPreview && (
                    <button
                      type="button"
                      className="ml-2 text-xs text-primary hover:underline"
                      onClick={() => {
                        void navigator.clipboard.writeText(e.requestBodyPreview || '');
                      }}
                    >
                      Copy
                    </button>
                  )}
                  {e.replayId && (
                    <button
                      type="button"
                      className="ml-2 text-xs text-primary hover:underline"
                      onClick={() => {
                        void replayRequest(e.replayId!)
                          .then((r) => toast(r.success ? `Replay OK (${r.statusCode})` : `Replay failed (${r.statusCode})`, r.success ? 'success' : 'error'))
                          .catch((err) => toast(err instanceof Error ? err.message : 'Replay failed', 'error'));
                      }}
                    >
                      Replay
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
