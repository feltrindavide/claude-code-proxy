'use client';
import { useState } from 'react';
import { saveProvider, testProviderConnection, testProviderDry } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Eye, EyeOff, Check, X } from 'lucide-react';

interface ProviderFormProps {
  provider?: { name: string; baseUrl: string; enabled: boolean; priority: number; providerType?: string } | null;
  onSave: (data: {
    name: string;
    baseUrl: string;
    apiKey: string;
    providerType: string;
    enabled: boolean;
    priority: number;
  }) => void;
  onClose: () => void;
}

const providerTypes = ['OpenRouter', 'OpenCode Zen', 'OpenCode Go', 'NVIDIA NIM', 'Ollama', 'Google Gemini', 'Anthropic', 'DeepSeek', 'Custom'];

const defaultBaseUrls: Record<string, string> = {
  'OpenRouter': 'https://openrouter.ai/api',
  'OpenCode Zen': 'https://opencode.ai/zen',
  'OpenCode Go': 'https://opencode.ai/zen/go',
  'NVIDIA NIM': 'https://integrate.api.nvidia.com/v1',
  'Ollama': 'http://localhost:11434',
  'Google Gemini': 'https://generativelanguage.googleapis.com',
  'Anthropic': 'https://api.anthropic.com',
  'DeepSeek': 'https://api.deepseek.com',
  'Custom': '',
};

function getDisplayProviderType(internal?: string): string {
  const reverse: Record<string, string> = {
    OpenRouter: 'OpenRouter',
    openrouter: 'OpenRouter',
    'opencode-zen': 'OpenCode Zen',
    'opencode-go': 'OpenCode Go',
    'nvidia-nim': 'NVIDIA NIM',
    nvidia: 'NVIDIA NIM',
    Ollama: 'Ollama',
    ollama: 'Ollama',
    'google-gemini': 'Google Gemini',
    anthropic: 'Anthropic',
    deepseek: 'DeepSeek',
    custom: 'Custom',
    'custom-anthropic': 'Custom',
  };
  return reverse[internal || ''] || internal || 'Custom';
}

export function ProviderForm({ provider, onSave, onClose }: ProviderFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState(provider?.name || '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || '');
  const [apiKey, setApiKey] = useState(provider ? '••••••••' : '');
  const [providerType, setProviderType] = useState(getDisplayProviderType(provider?.providerType));
  const [apiFormat, setApiFormat] = useState<'openai' | 'anthropic'>('openai');
  const [showKey, setShowKey] = useState(false);
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [priority, setPriority] = useState(provider?.priority ?? 1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyEditing, setKeyEditing] = useState(false);

  function validate() {
    const newErrors: Record<string, string> = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = 'Provider name is required';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
      newErrors.name = 'Use letters, numbers, dashes or underscores only (e.g. openrouter, nvidia-nim)';
    }
    if (!baseUrl.trim()) {
      newErrors.baseUrl = 'Base URL is required';
    } else {
      try {
        new URL(baseUrl);
      } catch {
        newErrors.baseUrl = 'Must be a valid URL (e.g., https://api.example.com)';
      }
    }
    if (!provider && !apiKey.trim() && providerType !== 'Ollama') {
      newErrors.apiKey = 'API key is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function getInternalProviderType(displayType: string): string {
    const map: Record<string, string> = {
      'OpenRouter': 'OpenRouter',
      'OpenCode Zen': 'opencode-zen',
      'OpenCode Go': 'opencode-go',
      'NVIDIA NIM': 'nvidia-nim',
      'Ollama': 'Ollama',
      'Google Gemini': 'google-gemini',
      'Anthropic': 'anthropic',
      'DeepSeek': 'deepseek',
      'Custom': apiFormat === 'anthropic' ? 'custom-anthropic' : 'custom',
    };
    return map[displayType] || displayType;
  }

  function handleProviderTypeChange(type: string) {
    setProviderType(type);
    // Auto-fill base URL when changing provider type (only for new providers)
    if (!provider && defaultBaseUrls[type]) {
      setBaseUrl(defaultBaseUrls[type]);
    }
  }

  async function handleTest() {
    if (!name.trim() || !baseUrl.trim()) {
      toast('Name and base URL are required to test', 'error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const internalType = getInternalProviderType(providerType);
      const submitApiKey = apiKey === '••••••••' ? undefined : apiKey;

      const result = provider
        ? await testProviderConnection(name)
        : await testProviderDry({
            name: name.trim(),
            baseUrl: baseUrl.trim(),
            apiKey: submitApiKey,
            providerType: internalType,
          });

      setTestResult(result);
      if (result.valid) {
        toast('Connection successful', 'success');
      } else {
        toast(result.error || `Unable to connect to ${name}. Check the base URL and API key.`, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed';
      setTestResult({ valid: false, error: message });
      toast(message, 'error');
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const internalType = getInternalProviderType(providerType);
      // Don't send masked key — backend will keep existing keychain entry
      const submitApiKey = apiKey === '••••••••' ? '' : apiKey;
      await saveProvider({ name, baseUrl, apiKey: submitApiKey, providerType: internalType, enabled, priority });
      onSave({ name, baseUrl, apiKey: submitApiKey, providerType: internalType, enabled, priority });
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
        disabled={!!provider}
      />

      <div className="space-y-xs">
        <label className="block text-sm text-body">Provider Type</label>
        <Select
          value={providerType}
          onChange={handleProviderTypeChange}
          options={providerTypes.map(t => ({ value: t, label: t }))}
        />
      </div>

      {providerType === 'Custom' && (
        <div className="space-y-xs">
          <label className="block text-sm text-body">API Format</label>
          <Select
            value={apiFormat}
            onChange={(v) => setApiFormat(v as 'openai' | 'anthropic')}
            options={[
              { value: 'openai', label: 'OpenAI (/v1/chat/completions)' },
              { value: 'anthropic', label: 'Anthropic (/v1/messages)' },
            ]}
          />
        </div>
      )}

      <Input
        label="Base URL"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        error={errors.baseUrl}
        placeholder="e.g., https://openrouter.ai/api"
      />

      {providerType !== 'Ollama' && (
        <div className="space-y-xs">
          <label className="block text-sm text-body">API Key</label>
          {!keyEditing ? (
            <div className="flex items-center justify-between bg-surface-card border border-hairline rounded-md h-11 px-4">
              <span className={provider ? 'text-ink text-sm' : 'text-muted text-sm'}>
                {provider ? '✓ Configured' : '✗ Not configured'}
              </span>
              <button
                type="button"
                onClick={() => { setKeyEditing(true); if (!provider) setApiKey(''); }}
                className="text-sm text-primary hover:text-primary-active font-medium focus-ring rounded px-2 py-1"
              >
                {provider ? 'Change' : 'Add Key'}
              </button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider ? 'New API key (leave empty to keep current)' : 'Enter your API key'}
                  className="w-full bg-surface-card text-ink border border-hairline rounded-md text-body focus-ring h-11 px-4 pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink focus-ring"
                  aria-label={showKey ? 'Hide' : 'Show'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-xs mt-xs">
                <button
                  type="button"
                  onClick={() => { setKeyEditing(false); setShowKey(false); if (provider) setApiKey('••••••••'); else setApiKey(''); }}
                  className="text-small text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {errors.apiKey && <p className="text-small text-semantic-error">{errors.apiKey}</p>}
        </div>
      )}

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
