'use client';
import { useState } from 'react';
import { saveProvider, testProviderConnection } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Check, X } from 'lucide-react';

interface ProviderFormProps {
  provider?: { name: string; baseUrl: string; enabled: boolean; priority: number; providerType?: string } | null;
  onSave: (data: any) => void;
  onClose: () => void;
}

const providerTypes = ['OpenRouter', 'OpenCode', 'Ollama', 'Custom'];

export function ProviderForm({ provider, onSave, onClose }: ProviderFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState(provider?.name || '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || '');
  const [apiKey, setApiKey] = useState(provider ? '••••••••' : '');
  const [providerType, setProviderType] = useState(provider?.providerType || 'OpenRouter');
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [priority, setPriority] = useState(provider?.priority ?? 1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function validate() {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Provider name is required';
    if (!baseUrl.trim()) {
      newErrors.baseUrl = 'Base URL is required';
    } else {
      try {
        new URL(baseUrl);
      } catch {
        newErrors.baseUrl = 'Must be a valid URL (e.g., https://api.example.com)';
      }
    }
    if (!provider && !apiKey.trim()) {
      newErrors.apiKey = 'API key is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleTest() {
    if (!name.trim() || !baseUrl.trim()) {
      toast('Name and base URL are required to test', 'error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // For new providers, save first then test
      if (!provider) {
        await saveProvider({ name, baseUrl, apiKey, providerType, enabled, priority });
      }
      const result = await testProviderConnection(name);
      setTestResult(result);
      if (result.valid) {
        toast('Connection successful', 'success');
      } else {
        toast(`Unable to connect to ${name}. Check the base URL and API key, then try again.`, 'error');
      }
    } catch (error) {
      setTestResult({ valid: false, error: 'Test failed' });
      toast(`Unable to connect to ${name}. Check the base URL and API key, then try again.`, 'error');
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      // Don't send masked key — backend will keep existing keychain entry
      const submitApiKey = apiKey === '••••••••' ? '' : apiKey;
      await saveProvider({ name, baseUrl, apiKey: submitApiKey, providerType, enabled, priority });
      onSave({ name, baseUrl, apiKey: submitApiKey, providerType, enabled, priority });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to save provider', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-lg">
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        placeholder="e.g., openrouter"
      />

      <Input
        label="Base URL"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        error={errors.baseUrl}
        placeholder="e.g., https://openrouter.ai/api/v1"
      />

      <Input
        label="API Key"
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        error={errors.apiKey}
        placeholder={provider ? 'Leave blank to keep existing key' : 'Enter your API key'}
      />
      {provider && apiKey === '••••••••' && (
        <p className="text-small text-muted -mt-xs">
          🔒 API key is stored securely in Keychain — leave as-is to keep current key
        </p>
      )}

      <div className="space-y-xs">
        <label className="block text-sm text-body">Provider Type</label>
        <Select
          value={providerType}
          onChange={setProviderType}
          options={providerTypes.map(t => ({ value: t, label: t }))}
        />
      </div>

      <div className="flex items-center gap-md">
        <label className="flex items-center gap-xs cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-hairline text-primary focus:ring-primary"
          />
          <span className="text-sm text-body">Enabled</span>
        </label>

        <div className="flex items-center gap-xs">
          <label className="text-sm text-body">Priority</label>
          <input
            type="number"
            min={0}
            max={100}
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
            className="w-16 bg-surface-card text-ink border border-hairline rounded-md text-body focus-ring h-9 px-2 text-center"
          />
        </div>
      </div>

      {/* Test Connection */}
      <div className="flex items-center gap-md">
        <Button
          type="button"
          variant="secondary"
          onClick={handleTest}
          loading={testing}
          loadingText="Testing connection..."
          disabled={!name.trim() || !baseUrl.trim()}
        >
          {!testing && testResult?.valid && <Check className="w-4 h-4 text-semantic-success" />}
          {!testing && testResult && !testResult.valid && <X className="w-4 h-4 text-semantic-error" />}
          Test Connection
        </Button>
        {testResult && !testResult.valid && testResult.error && (
          <span className="text-small text-semantic-error">{testResult.error}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-md justify-end pt-md border-t border-hairline">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} loadingText="Saving...">
          Save Provider
        </Button>
      </div>
    </form>
  );
}
