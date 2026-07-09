'use client';
import { useEffect, useState } from 'react';
import { fetchProviders, deleteProvider } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useHealthStore } from '@/stores/healthStore';
import { WarningBadge } from '@/components/WarningBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/Modal';
import { ProviderForm } from '@/components/ProviderForm';
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface Provider {
  name: string;
  baseUrl: string;
  keyId: string;
  keyMask: string | null;
  models: string[];
  enabled: boolean;
  priority: number;
  providerType?: string;
  autoDiscovered?: boolean;
}

export function ProviderList() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { toast } = useToast();
  const { isProviderHealthy, getProviderError } = useHealthStore();

  useEffect(() => {
    void loadProviders();
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

  async function handleDelete(name: string) {
    try {
      await deleteProvider(name);
      setProviders((prev) => prev.filter((p) => p.name !== name));
      toast('Provider removed', 'success');
    } catch {
      toast('Failed to delete provider', 'error');
    }
    setDeleteConfirm(null);
  }

  function handleSave(_data: {
    name: string;
    baseUrl: string;
    apiKey: string;
    providerType: string;
    enabled: boolean;
    priority: number;
  }) {
    setFormOpen(false);
    setEditingProvider(null);
    loadProviders();
    toast('Provider saved successfully', 'success');
  }

  if (loading) {
    return <p className="text-body">Loading providers...</p>;
  }

  if (providers.length === 0) {
    return (
      <div>
        <div className="flex justify-between items-center mb-lg">
          <h2 className="font-display text-[22px] text-ink">Providers</h2>
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            <Plus className="w-4 h-4 mr-xs" />
            Add Provider
          </Button>
        </div>
        <Card className="text-center py-2xl">
          <h3 className="font-heading text-[18px] text-ink mb-xs">
            No providers configured
          </h3>
          <p className="text-body mb-lg">
            Add your first provider to start routing Claude Code requests through the proxy.
          </p>
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            <Plus className="w-4 h-4 mr-xs" />
            Add Provider
          </Button>
        </Card>
        <Modal
          title="Add Provider"
          open={formOpen}
          onClose={() => setFormOpen(false)}
        >
          <ProviderForm onSave={handleSave} onClose={() => setFormOpen(false)} />
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-lg">
        <h2 className="font-display text-[22px] text-ink">Providers</h2>
        <Button variant="primary" onClick={() => { setEditingProvider(null); setFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-xs" />
          Add Provider
        </Button>
      </div>

      <div className="space-y-xs">
        {providers.map((p) => (
          <Card key={p.name} className="flex items-center justify-between">
              <div className="flex items-center gap-md">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  isProviderHealthy(p.name)
                    ? 'bg-semantic-success'
                    : 'bg-muted'
                }`} />
                <div>
                  <p className="font-heading text-[18px] text-ink">{p.name}</p>
                  <p className="text-small text-muted font-mono">{p.baseUrl}</p>
                </div>
              <span className="bg-surface-strong text-ink text-[11px] font-semibold uppercase tracking-[0.88px] rounded-pill px-[10px] py-xxs">
                {p.enabled ? 'Enabled' : 'Disabled'}
              </span>
              {p.autoDiscovered && (
                <span className="bg-primary/10 text-primary text-[11px] font-semibold uppercase tracking-[0.88px] rounded-pill px-[10px] py-xxs">
                  Auto
                </span>
              )}
              {!isProviderHealthy(p.name) && (
                <WarningBadge message={getProviderError(p.name) || 'Connection failed'} />
              )}
            </div>
            <div className="flex items-center gap-xs">
              <Button
                variant="ghost"
                onClick={() => { setEditingProvider(p); setFormOpen(true); }}
                className="min-h-[44px] w-10 px-0"
                aria-label={`Edit ${p.name}`}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDeleteConfirm(p.name)}
                className="min-h-[44px] w-10 px-0 text-semantic-error hover:text-red-700"
                aria-label={`Delete ${p.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        title={editingProvider ? 'Edit Provider' : 'Add Provider'}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingProvider(null); }}
      >
        <ProviderForm
          provider={editingProvider}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditingProvider(null); }}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        title="Confirm Delete"
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
      >
        <p className="text-body mb-lg" id="delete-confirm-desc">
          Remove <strong>{deleteConfirm}</strong>? This action cannot be undone. The API key will be removed from Keychain.
        </p>
        <div className="flex gap-md justify-end">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)} aria-label="Cancel delete">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteConfirm && void handleDelete(deleteConfirm)}
            aria-describedby="delete-confirm-desc"
          >
            Remove Provider
          </Button>
        </div>
      </Modal>
    </div>
  );
}
