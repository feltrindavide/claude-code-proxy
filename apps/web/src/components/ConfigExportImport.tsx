'use client';
import { useState, useRef } from 'react';
import { exportConfig, importConfig, fetchDiff } from '@/lib/api';
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
