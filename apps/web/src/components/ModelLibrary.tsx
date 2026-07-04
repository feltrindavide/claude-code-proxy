'use client';
import { useEffect, useState } from 'react';
import { fetchProviders, saveProvider, scanProviderModels, importOpenRouterModels, patchProviderModels } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/Modal';
import { Plus, X, Scan, Loader2, Download } from 'lucide-react';

interface ProviderModel {
  name: string;
  baseUrl: string;
  keyId: string;
  models: string[];
  enabled: boolean;
  priority: number;
  providerType?: string;
}

export function ModelLibrary() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<ProviderModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [newModelInputs, setNewModelInputs] = useState<Record<string, string>>({});
  
  // Scan state
  const [scanningProvider, setScanningProvider] = useState<string | null>(null);
  const [importingProvider, setImportingProvider] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<{ providerName: string; models: string[]; selected: Set<string> } | null>(null);
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    loadProviders();
  }, []);

  async function loadProviders() {
    try {
      const data = await fetchProviders();
      setProviders(data);
    } catch {
      toast('Failed to load providers', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleModelInputChange(providerName: string, value: string) {
    setNewModelInputs(prev => ({ ...prev, [providerName]: value }));
  }

  async function addModel(providerName: string) {
    const model = newModelInputs[providerName]?.trim();
    if (!model) return;

    const provider = providers.find(p => p.name === providerName);
    if (!provider) return;

    if (provider.models.includes(model)) {
      toast('Model already exists', 'error');
      return;
    }

    try {
      await patchProviderModels(provider.name, [...provider.models, model]);
      setNewModelInputs(prev => ({ ...prev, [providerName]: '' }));
      toast(`Model "${model}" added`, 'success');
      loadProviders();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to add model', 'error');
    }
  }

  async function removeModel(providerName: string, model: string) {
    const provider = providers.find(p => p.name === providerName);
    if (!provider) return;

    try {
      await patchProviderModels(provider.name, provider.models.filter(m => m !== model));
      toast(`Model "${model}" removed`, 'success');
      loadProviders();
    } catch {
      toast('Failed to remove model', 'error');
    }
  }

  async function handleOpenRouterImport(providerName: string, filter: 'all' | 'free' | 'paid' = 'free') {
    setImportingProvider(providerName);
    try {
      const result = await importOpenRouterModels(providerName, filter);
      toast(`Imported ${result.added.length} models (${result.total} total)`, 'success');
      loadProviders();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed', 'error');
    } finally {
      setImportingProvider(null);
    }
  }

  function isOpenRouter(provider: ProviderModel): boolean {
    const t = (provider.providerType || '').toLowerCase();
    return t.includes('openrouter') || provider.baseUrl.includes('openrouter.ai');
  }

  async function handleScan(providerName: string) {
    setScanningProvider(providerName);
    setSelectAll(false);
    try {
      const result = await scanProviderModels(providerName);
      setScanResults({
        providerName,
        models: result.models,
        selected: new Set<string>(),
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to scan models', 'error');
    } finally {
      setScanningProvider(null);
    }
  }

  function toggleModelSelection(model: string) {
    if (!scanResults) return;
    const newSelected = new Set(scanResults.selected);
    if (newSelected.has(model)) {
      newSelected.delete(model);
    } else {
      newSelected.add(model);
    }
    setScanResults({ ...scanResults, selected: newSelected });
  }

  function toggleSelectAll() {
    if (!scanResults) return;
    const allSelected = scanResults.selected.size === scanResults.models.length;
    if (allSelected) {
      setScanResults({ ...scanResults, selected: new Set() });
    } else {
      setScanResults({ ...scanResults, selected: new Set(scanResults.models) });
    }
  }

  async function importSelectedModels() {
    if (!scanResults) return;
    const provider = providers.find(p => p.name === scanResults.providerName);
    if (!provider || scanResults.selected.size === 0) return;

    const existing = new Set(provider.models);
    const newModels = Array.from(scanResults.selected).filter(m => !existing.has(m));
    if (newModels.length === 0) {
      toast('No new models to add', 'warning');
      setScanResults(null);
      return;
    }

    try {
      await patchProviderModels(provider.name, [...provider.models, ...newModels]);
      toast(`${newModels.length} model${newModels.length > 1 ? 's' : ''} added`, 'success');
      setScanResults(null);
      loadProviders();
    } catch {
      toast('Failed to import models', 'error');
    }
  }

  async function handleKeyDown(e: React.KeyboardEvent, providerName: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addModel(providerName);
    }
  }

  if (loading) {
    return <p className="text-body">Loading models...</p>;
  }

  if (providers.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <h2 className="font-display text-[22px] text-ink mb-lg">Model Library</h2>
        <Card className="text-center py-2xl">
          <h3 className="font-heading text-[18px] text-ink mb-xs">No providers configured</h3>
          <p className="text-body">Add providers first to manage their models.</p>
        </Card>
      </div>
    );
  }

  return (
    <>
      <h2 className="font-display text-[22px] text-ink mb-lg">Model Library</h2>
      <p className="text-body text-muted mb-lg">
        Manage available models for each provider. Use <strong>Scan</strong> to fetch available models from the provider API.
      </p>

      <div className="space-y-md">
        {providers.map(provider => (
          <Card key={provider.name}>
            <div className="flex items-start justify-between mb-md">
              <div>
                <h3 className="font-heading text-[18px] text-ink">{provider.name}</h3>
                <p className="text-small text-muted font-mono">{provider.baseUrl}</p>
              </div>
              <span className="bg-surface-strong text-ink text-[11px] font-semibold rounded-pill px-[10px] py-xxs">
                {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Existing models */}
            {provider.models.length > 0 ? (
              <div className="flex flex-wrap gap-xs mb-md">
                {provider.models.map((model, idx) => (
                  <span key={`${provider.name}-${model}-${idx}`} className="inline-flex items-center gap-xs bg-canvas-soft text-ink text-small rounded-pill px-xs py-xxs border border-hairline">
                    <span className="font-mono">{model}</span>
                    <button onClick={() => removeModel(provider.name, model)} className="text-muted hover:text-semantic-error transition-colors" aria-label={`Remove ${model}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-small text-muted mb-md">No models configured yet</p>
            )}

            {/* Add & Scan controls */}
            <div className="flex gap-xs">
              <input
                type="text"
                value={newModelInputs[provider.name] || ''}
                onChange={(e) => handleModelInputChange(provider.name, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, provider.name)}
                placeholder="e.g., openai/gpt-4o"
                className="flex-1 bg-surface-card text-ink border border-hairline rounded-md text-body focus-ring h-9 px-3 font-mono text-small"
              />
              <Button variant="secondary" onClick={() => addModel(provider.name)} disabled={!newModelInputs[provider.name]?.trim()}>
                <Plus className="w-3 h-3 mr-xs" />
                Add
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleScan(provider.name)}
                loading={scanningProvider === provider.name}
                loadingText="Scanning..."
              >
                <Scan className="w-3 h-3 mr-xs" />
                Scan
              </Button>
              {isOpenRouter(provider) && (
                <Button
                  variant="secondary"
                  onClick={() => handleOpenRouterImport(provider.name, 'free')}
                  loading={importingProvider === provider.name}
                  loadingText="Importing..."
                >
                  <Download className="w-3 h-3 mr-xs" />
                  OpenRouter
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Scan Results Modal */}
      <Modal
        title={`Models — ${scanResults?.providerName || ''}`}
        open={scanResults !== null}
        onClose={() => setScanResults(null)}
      >
        {scanResults && (
          <div className="space-y-md">
            <p className="text-small text-muted">
              Select models to add to this provider. Already added models are hidden.
            </p>

            {/* Select all toggle */}
            <label className="flex items-center gap-xs cursor-pointer">
              <input
                type="checkbox"
                checked={scanResults.selected.size === scanResults.models.length && scanResults.models.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-hairline text-primary focus:ring-primary"
              />
              <span className="text-small text-ink font-medium">
                {scanResults.selected.size === scanResults.models.length && scanResults.models.length > 0
                  ? 'Deselect all'
                  : 'Select all'}
              </span>
              <span className="text-small text-muted">({scanResults.models.length} available)</span>
            </label>

            {/* Model list */}
            <div className="max-h-80 overflow-y-auto space-y-xxs border border-hairline rounded-md p-xs">
              {scanResults.models.map(model => {
                const provider = providers.find(p => p.name === scanResults.providerName);
                const alreadyAdded = provider?.models.includes(model);
                return (
                  <label
                    key={model}
                    className={`flex items-center gap-xs px-xs py-xxs rounded hover:bg-canvas-soft cursor-pointer ${alreadyAdded ? 'opacity-40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={scanResults.selected.has(model) || !!alreadyAdded}
                      disabled={!!alreadyAdded}
                      onChange={() => toggleModelSelection(model)}
                      className="w-4 h-4 rounded border-hairline text-primary focus:ring-primary"
                    />
                    <span className="font-mono text-small text-ink">{model}</span>
                    {alreadyAdded && <span className="text-small text-muted ml-auto">already added</span>}
                  </label>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-xs justify-end">
              <Button variant="ghost" onClick={() => setScanResults(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={importSelectedModels}
                disabled={scanResults.selected.size === 0}
              >
                Add Selected ({scanResults.selected.size})
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
