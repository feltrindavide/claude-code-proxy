'use client';
import { useState, useRef, useEffect } from 'react';
import { exportConfig, importConfig, fetchDiff, fetchConfigAudit, rollbackConfig, type ConfigAuditEntry } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { JsonDiffViewer } from '@/components/JsonDiffViewer';
import { Button } from '@/components/ui/Button';
import { Download, Upload } from 'lucide-react';

export function ConfigExportImport() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffData, setDiffData] = useState<{ current: object; incoming: object } | null>(null);
  const [pendingImport, setPendingImport] = useState<object | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<ConfigAuditEntry[]>([]);

  useEffect(() => {
    void fetchConfigAudit()
      .then((data) => setAuditEntries(data.entries))
      .catch(() => setAuditEntries([]));
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportConfig();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'claude-code-proxy-config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Configuration exported successfully', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to export configuration', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      toast('Please select a JSON file', 'error');
      return;
    }
    setIsImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      const incoming = JSON.parse(text);
      // Fetch current config for diff
      const diff = await fetchDiff(incoming);
      setDiffData(diff);
      setPendingImport(incoming);
      setShowDiffModal(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON file';
      setImportError(msg);
      toast(msg, 'error');
    } finally {
      setIsImporting(false);
      // Reset file input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportApply = async (strategy: 'merge' | 'replace') => {
    if (!pendingImport) return;
    try {
      await importConfig(pendingImport, strategy);
      toast(`Configuration imported (${strategy})`, 'success');
      setShowDiffModal(false);
      setDiffData(null);
      setPendingImport(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to import config', 'error');
    }
  };

  async function handleRollback(id: string) {
    try {
      await rollbackConfig(id);
      toast('Configuration rolled back', 'success');
      const data = await fetchConfigAudit();
      setAuditEntries(data.entries);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Rollback failed', 'error');
    }
  }

  return (
    <div className="bg-surface-card rounded-lg border border-hairline p-lg">
      <h2 className="font-display text-[22px] text-ink mb-lg">Configuration</h2>

      {/* Export section */}
      <div className="mb-lg">
        <Button
          variant="secondary"
          onClick={handleExport}
          loading={isExporting}
          loadingText="Exporting..."
        >
          <Download className="w-4 h-4" />
          Export Config
        </Button>
        <p className="text-small text-muted mt-xs">Download your current configuration as JSON. API keys are masked for security.</p>
      </div>

      {/* Import section */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          loading={isImporting}
          loadingText="Reading..."
        >
          <Upload className="w-4 h-4" />
          Import Config
        </Button>
        <p className="text-small text-muted mt-xs">Import a configuration file. You&apos;ll see a diff preview before changes are applied.</p>
        {importError && (
          <p className="text-small text-semantic-error mt-xs">{importError}</p>
        )}
      </div>

      <div className="mt-lg border-t border-hairline pt-lg">
        <h3 className="font-heading text-[16px] text-ink mb-sm">Config history</h3>
        <p className="text-small text-muted mb-md">One-click rollback to a previous snapshot.</p>
        {auditEntries.length === 0 ? (
          <p className="text-small text-muted">No audit entries yet.</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-auto">
            {auditEntries.slice(0, 10).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono text-xs truncate">
                  {new Date(entry.timestamp).toLocaleString()} — {entry.action}
                  {entry.summary ? ` (${entry.summary})` : ''}
                </span>
                <Button variant="secondary" onClick={() => void handleRollback(entry.id)}>
                  Rollback
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Diff preview modal */}
      <Modal title="Configuration Diff" open={showDiffModal} onClose={() => setShowDiffModal(false)}>
        <div className="space-y-lg">
          <p className="text-sm text-body">Review the changes below. Choose to merge with your current configuration or replace it entirely.</p>
          {diffData && <JsonDiffViewer current={diffData.current} incoming={diffData.incoming} />}
          <div className="flex gap-xs justify-end">
            <Button variant="ghost" onClick={() => setShowDiffModal(false)}>Cancel</Button>
            <Button variant="secondary" onClick={() => handleImportApply('merge')}>Merge</Button>
            <Button variant="primary" onClick={() => handleImportApply('replace')}>Replace</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
