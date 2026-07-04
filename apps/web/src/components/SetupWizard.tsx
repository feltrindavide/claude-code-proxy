'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveProvider,
  saveRoutes,
  testProviderConnection,
  importOpenRouterModels,
  scanProviderModels,
  completeOnboarding,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Check, ChevronRight, Server, Key, Route, Zap } from 'lucide-react';

const STEPS = [
  { id: 1, title: 'Provider', icon: Server },
  { id: 2, title: 'API Key', icon: Key },
  { id: 3, title: 'Mapping', icon: Route },
  { id: 4, title: 'Test', icon: Zap },
] as const;

const PRESETS = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Cloud models via OpenRouter (recommended)',
    providerType: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    defaultName: 'openrouter',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Local models on your machine',
    providerType: 'Ollama',
    baseUrl: 'http://localhost:11434',
    defaultName: 'ollama',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Any OpenAI-compatible endpoint',
    providerType: 'Custom',
    baseUrl: '',
    defaultName: 'custom',
  },
] as const;

export function SetupWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('openrouter');
  const [providerName, setProviderName] = useState('openrouter');
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [opusModel, setOpusModel] = useState('');
  const [sonnetModel, setSonnetModel] = useState('');
  const [haikuModel, setHaikuModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  function selectPreset(id: (typeof PRESETS)[number]['id']) {
    const p = PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setProviderName(p.defaultName);
    setBaseUrl(p.baseUrl);
  }

  async function saveProviderStep() {
    const p = PRESETS.find((x) => x.id === preset)!;
    setSaving(true);
    try {
      await saveProvider({
        name: providerName.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        providerType: p.providerType,
        models: [],
        enabled: true,
        priority: 1,
      });

      if (preset === 'openrouter' && apiKey.trim()) {
        const imported = await importOpenRouterModels(providerName.trim(), 'free');
        setModels(imported.added.slice(0, 50));
        if (imported.added[0]) {
          setOpusModel(imported.added[0]);
          setSonnetModel(imported.added[1] || imported.added[0]);
          setHaikuModel(imported.added.find((m) => m.includes(':free')) || imported.added[0]);
        }
        toast(`Imported ${imported.added.length} free models`, 'success');
      } else if (preset === 'ollama') {
        try {
          const scanned = await scanProviderModels(providerName.trim());
          setModels(scanned.models);
          if (scanned.models[0]) {
            setOpusModel(scanned.models[0]);
            setSonnetModel(scanned.models[1] || scanned.models[0]);
            setHaikuModel(scanned.models[2] || scanned.models[0]);
          }
          toast(`Found ${scanned.models.length} local models`, 'success');
        } catch {
          toast('Could not scan Ollama models — enter manually', 'warning');
        }
      }

      setStep(3);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to save provider', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveMappingStep() {
    if (!providerName.trim() || !opusModel || !sonnetModel || !haikuModel) {
      toast('All tier mappings are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveRoutes([
        { claudeTier: 'opus', providerName: providerName.trim(), targetModel: opusModel },
        { claudeTier: 'sonnet', providerName: providerName.trim(), targetModel: sonnetModel },
        { claudeTier: 'haiku', providerName: providerName.trim(), targetModel: haikuModel },
      ]);
      setStep(4);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save mapping', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestOk(null);
    try {
      const result = await testProviderConnection(providerName.trim());
      setTestOk(result.valid);
      if (!result.valid) toast(result.error || 'Connection failed', 'error');
    } catch {
      setTestOk(false);
      toast('Connection test failed', 'error');
    } finally {
      setTesting(false);
    }
  }

  async function finish() {
    try {
      await completeOnboarding();
      toast('Setup complete!', 'success');
      router.push('/');
    } catch {
      toast('Failed to save onboarding state', 'error');
    }
  }

  const modelOptions = models.map((m) => ({ value: m, label: m }));

  return (
    <div className="max-w-xl mx-auto py-xl">
      <div className="text-center mb-2xl">
        <h1 className="font-display text-[28px] text-ink mb-xs">Welcome to Claude Code Proxy</h1>
        <p className="text-body text-muted">Configure your first provider in a few steps.</p>
      </div>

      <div className="flex justify-between mb-xl">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const active = step === s.id;
          const done = step > s.id;
          return (
            <div key={s.id} className="flex flex-col items-center gap-xs flex-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
                done ? 'bg-primary border-primary text-white' :
                active ? 'border-primary text-primary' : 'border-hairline text-muted'
              }`}>
                {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-[11px] ${active ? 'text-ink font-medium' : 'text-muted'}`}>
                {s.title}
              </span>
            </div>
          );
        })}
      </div>

      <Card>
        {step === 1 && (
          <div className="space-y-md">
            <h2 className="font-heading text-[18px] text-ink">Choose a provider</h2>
            <div className="space-y-xs">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPreset(p.id)}
                  className={`w-full text-left p-md rounded-lg border transition-colors ${
                    preset === p.id ? 'border-primary bg-primary/5' : 'border-hairline hover:bg-canvas-soft'
                  }`}
                >
                  <p className="font-medium text-ink">{p.label}</p>
                  <p className="text-small text-muted">{p.description}</p>
                </button>
              ))}
            </div>
            <Button className="w-full" onClick={() => setStep(2)}>
              Continue <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-md">
            <h2 className="font-heading text-[18px] text-ink">Provider credentials</h2>
            <div>
              <label className="text-small text-muted">Provider name</label>
              <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} />
            </div>
            <div>
              <label className="text-small text-muted">Base URL</label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
            {preset !== 'ollama' && (
              <div>
                <label className="text-small text-muted">API Key</label>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
            )}
            <div className="flex gap-xs">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button className="flex-1" loading={saving} onClick={() => void saveProviderStep()}>
                Save & continue
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-md">
            <h2 className="font-heading text-[18px] text-ink">Map Claude tiers</h2>
            {models.length === 0 ? (
              <div className="space-y-md">
                <Input placeholder="Opus model id" value={opusModel} onChange={(e) => setOpusModel(e.target.value)} />
                <Input placeholder="Sonnet model id" value={sonnetModel} onChange={(e) => setSonnetModel(e.target.value)} />
                <Input placeholder="Haiku model id" value={haikuModel} onChange={(e) => setHaikuModel(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-md">
                <div>
                  <label className="text-small text-muted block mb-xs">Opus</label>
                  <Select value={opusModel} onChange={setOpusModel} options={modelOptions} placeholder="Select model..." />
                </div>
                <div>
                  <label className="text-small text-muted block mb-xs">Sonnet</label>
                  <Select value={sonnetModel} onChange={setSonnetModel} options={modelOptions} placeholder="Select model..." />
                </div>
                <div>
                  <label className="text-small text-muted block mb-xs">Haiku</label>
                  <Select value={haikuModel} onChange={setHaikuModel} options={modelOptions} placeholder="Select model..." />
                </div>
              </div>
            )}
            <div className="flex gap-xs">
              <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
              <Button className="flex-1" loading={saving} onClick={() => void saveMappingStep()}>
                Save mapping
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-md text-center">
            <h2 className="font-heading text-[18px] text-ink">Test connection</h2>
            <p className="text-body text-muted">
              Verify that the proxy can reach your provider.
            </p>
            <Button loading={testing} onClick={() => void runTest()}>
              Test connection
            </Button>
            {testOk === true && (
              <p className="text-semantic-success text-small">Connection successful</p>
            )}
            {testOk === false && (
              <p className="text-semantic-error text-small">Connection failed — check API key and URL</p>
            )}
            <Button
              className="w-full"
              disabled={testOk !== true}
              onClick={() => void finish()}
            >
              Finish setup
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
