'use client';
import { useEffect, useState } from 'react';
import {
  fetchConfig,
  fetchThinkingConfig,
  saveThinkingConfig,
  fetchCacheConfig,
  saveCacheConfig,
  fetchNetworkConfig,
  saveNetworkConfig,
  fetchMtlsStatus,
  saveMtlsConfig,
  checkHealth,
  checkForUpdates,
  testNetworkConnection,
} from '@/lib/api';
import type { ThinkingConfig, CacheConfig, TierThinkingConfig, MtlsStatus } from '@/lib/api';
import { openDownloadPage } from '@/services/updater';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Shield, RefreshCw, Brain, Database, Save } from 'lucide-react';

export function SettingsForm() {
  const { toast } = useToast();
  const [port, setPort] = useState('3456');
  const [bindHost, setBindHost] = useState('127.0.0.1');
  const [lanBindAllowed, setLanBindAllowed] = useState(false);
  const [keychainAvailable, setKeychainAvailable] = useState<boolean | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [testingNetwork, setTestingNetwork] = useState(false);
  const [mtlsStatus, setMtlsStatus] = useState<MtlsStatus | null>(null);
  const [savingMtls, setSavingMtls] = useState(false);
  const [appVersion, setAppVersion] = useState('...');
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const [thinkingConfig, setThinkingConfig] = useState<ThinkingConfig | null>(null);
  const [savingThinking, setSavingThinking] = useState(false);

  const [cacheConfig, setCacheConfig] = useState<CacheConfig | null>(null);
  const [savingCache, setSavingCache] = useState(false);

  useEffect(() => {
    loadSettings();
    loadAdvancedConfig();
  }, []);

  async function loadSettings() {
    try {
      await fetchConfig();
      setKeychainAvailable(true);

      const [network, mtls] = await Promise.all([
        fetchNetworkConfig().catch(() => null),
        fetchMtlsStatus().catch(() => null),
      ]);
      if (network) {
        setBindHost(network.host);
        setPort(String(network.port));
        setLanBindAllowed(network.lanBindAllowed);
      }
      if (mtls) setMtlsStatus(mtls);

      try {
        const health = await checkHealth();
        if (health.version) setAppVersion(health.version);
        if (health.port) setPort(String(health.port));
      } catch {}
    } catch {
      setKeychainAvailable(false);
    }
  }

  async function loadAdvancedConfig() {
    try {
      const [thinking, cache] = await Promise.all([
        fetchThinkingConfig().catch(() => null),
        fetchCacheConfig().catch(() => null),
      ]);
      if (thinking) setThinkingConfig(thinking);
      if (cache) setCacheConfig(cache);
    } catch {}
  }

  async function handleSaveAll() {
    setSavingAll(true);
    try {
      await saveNetworkConfig({
        host: bindHost,
        port: parseInt(port, 10) || 3456,
      });
      if (thinkingConfig) await saveThinkingConfig(thinkingConfig);
      if (cacheConfig) await saveCacheConfig(cacheConfig);
      toast('All settings saved', 'success');
    } catch {
      toast('Failed to save some settings', 'error');
    } finally {
      setSavingAll(false);
    }
  }

  async function handleSaveThinking() {
    if (!thinkingConfig) return;
    setSavingThinking(true);
    try {
      await saveThinkingConfig(thinkingConfig);
      toast('Thinking config saved', 'success');
    } catch {
      toast('Failed to save thinking config', 'error');
    } finally {
      setSavingThinking(false);
    }
  }

  async function handleSaveCache() {
    if (!cacheConfig) return;
    setSavingCache(true);
    try {
      await saveCacheConfig(cacheConfig);
      toast('Cache config saved', 'success');
    } catch {
      toast('Failed to save cache config', 'error');
    } finally {
      setSavingCache(false);
    }
  }

  function updateTierMode(tier: 'opus' | 'sonnet' | 'haiku', mode: TierThinkingConfig['mode']) {
    if (!thinkingConfig) return;
    setThinkingConfig({ ...thinkingConfig, [tier]: { mode } });
  }

  function updateCacheField(field: keyof CacheConfig, value: number | boolean) {
    if (!cacheConfig) return;
    setCacheConfig({ ...cacheConfig, [field]: value });
  }

  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);

  async function handleCheckUpdates() {
    setCheckingUpdate(true);
    setUpdateStatus('Checking...');
    setUpdateAvailable(null);
    try {
      const data = await checkForUpdates();
      const latestVer = data.version;

      const parse = (v: string) => v.split('.').map(n => parseInt(n) || 0);
      const cur = parse(appVersion);
      const lat = parse(latestVer);

      for (let i = 0; i < Math.max(cur.length, lat.length); i++) {
        if ((lat[i] || 0) > (cur[i] || 0)) {
          setUpdateStatus(`v${latestVer} available!`);
          setUpdateAvailable(latestVer);
          toast(`v${latestVer} available!`, 'success');
          return;
        }
        if ((lat[i] || 0) < (cur[i] || 0)) break;
      }

      setUpdateStatus(`✓ v${appVersion} is up to date`);
      setTimeout(() => setUpdateStatus(null), 5000);
    } catch (e: unknown) {
      setUpdateStatus(`✗ Check failed: ${e instanceof Error ? e.message : 'Error'}`);
      setTimeout(() => setUpdateStatus(null), 5000);
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleTestNetwork() {
    setTestingNetwork(true);
    try {
      const result = await testNetworkConnection(parseInt(port, 10) || 3456);
      toast(
        result.ok ? `Proxy reachable (${result.status})` : 'Proxy not reachable on this port',
        result.ok ? 'success' : 'error',
      );
    } finally {
      setTestingNetwork(false);
    }
  }

  async function handleSaveNetwork() {
    setSavingNetwork(true);
    try {
      const result = await saveNetworkConfig({
        host: bindHost,
        port: parseInt(port, 10) || 3456,
      });
      setBindHost(result.host);
      setPort(String(result.port));
      toast(
        result.restartRequired
          ? 'Network settings saved — restart proxy to apply'
          : 'Network settings saved',
        'success',
      );
    } catch {
      toast('Failed to save network settings', 'error');
    } finally {
      setSavingNetwork(false);
    }
  }

  async function handleToggleMtls(enabled: boolean) {
    setSavingMtls(true);
    try {
      const result = await saveMtlsConfig({
        enabled,
        port: mtlsStatus?.port,
      });
      setMtlsStatus(result);
      toast(
        result.restartRequired
          ? `Admin mTLS ${enabled ? 'enabled' : 'disabled'} — restart proxy to apply`
          : `Admin mTLS ${enabled ? 'enabled' : 'disabled'}`,
        'success',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update mTLS', 'error');
    } finally {
      setSavingMtls(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-lg">
      <div className="flex items-center justify-between gap-md">
        <h2 className="font-display text-[22px] text-ink">Settings</h2>
        <Button
          variant="primary"
          onClick={handleSaveAll}
          loading={savingAll}
          loadingText="Saving..."
        >
          <Save className="w-4 h-4" />
          Save All
        </Button>
      </div>

      <Card title="Proxy Configuration">
        <div className="space-y-lg">
          <Input
            label="Bind Address"
            type="text"
            value={bindHost}
            onChange={(e) => setBindHost(e.target.value)}
            placeholder="127.0.0.1"
          />
          <p className="text-small text-muted -mt-sm">
            Localhost-only by default. Set ALLOW_LAN_BIND=true to bind on other interfaces.
            {lanBindAllowed ? ' (LAN bind allowed)' : ''}
          </p>
          <p className="text-small text-muted">
            API calls will use port <span className="font-mono text-ink">{port || '3456'}</span> after restart.
          </p>

          <Input
            label="Proxy Port"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="3456"
          />

          <Button
            variant="secondary"
            onClick={handleSaveNetwork}
            loading={savingNetwork}
            loadingText="Saving..."
          >
            Save Network Settings
          </Button>

          <Button
            variant="secondary"
            onClick={handleTestNetwork}
            loading={testingNetwork}
            loadingText="Testing..."
          >
            Test connection
          </Button>

          <div>
            <label className="block text-sm text-body mb-xs">Health Check Interval</label>
            <p className="text-small text-muted font-mono">5 seconds (fixed)</p>
          </div>
        </div>
      </Card>

      <Card title="Security">
        <div className="space-y-md">
          <div className="flex items-center gap-xs">
            <Shield className="w-4 h-4 text-semantic-success" />
            <span className="text-sm text-ink">
              Keychain: {keychainAvailable === null ? 'Checking...' : keychainAvailable ? 'Available' : 'Not available'}
            </span>
          </div>
          <p className="text-small text-muted">
            API keys are stored securely in the OS keychain when available and never appear in config files.
          </p>

          {mtlsStatus && (
            <div className="border-t border-hairline pt-md space-y-sm">
              <p className="text-sm font-medium text-ink">Admin mTLS (optional)</p>
              <p className="text-small text-muted">
                Separate HTTPS listener on port {mtlsStatus.port} for /admin only.
                Certificates: {mtlsStatus.certDir}
              </p>
              <p className="text-small text-muted font-mono">
                Generate: bash {mtlsStatus.generateScript}
              </p>
              <div className="flex items-center gap-md">
                <label className="flex items-center gap-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mtlsStatus.enabled}
                    disabled={savingMtls || (!mtlsStatus.ready && !mtlsStatus.enabled)}
                    onChange={(e) => handleToggleMtls(e.target.checked)}
                    className="w-4 h-4 rounded border-hairline text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-body">
                    Enable mTLS admin
                    {!mtlsStatus.ready && !mtlsStatus.enabled ? ' (certs missing)' : ''}
                  </span>
                </label>
                {mtlsStatus.ready && (
                  <span className="text-small text-semantic-success">Certs ready</span>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {thinkingConfig && (
        <Card title={
          <span className="flex items-center gap-xs">
            <Brain className="w-4 h-4" />
            Thinking Control
          </span>
        }>
          <p className="text-body text-muted mb-md">
            Control how thinking/reasoning blocks are handled per Claude tier.
          </p>
          <div className="space-y-md">
            {(['opus', 'sonnet', 'haiku'] as const).map((tier) => (
              <div key={tier} className="flex items-center gap-lg">
                <div className="w-24">
                  <p className="font-heading text-[16px] font-semibold text-ink capitalize">{tier}</p>
                </div>
                <div className="flex-1">
                  <Select
                    value={thinkingConfig[tier]?.mode || 'passthrough'}
                    onChange={(v) => updateTierMode(tier, v as TierThinkingConfig['mode'])}
                    options={[
                      { value: 'passthrough', label: 'Passthrough' },
                      { value: 'strip', label: 'Strip' },
                      { value: 'transform', label: 'Transform' },
                      { value: 'auto', label: 'Auto' },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-md">
            <Button
              variant="secondary"
              onClick={handleSaveThinking}
              loading={savingThinking}
              loadingText="Saving..."
            >
              Save Thinking Config
            </Button>
          </div>
        </Card>
      )}

      {cacheConfig && (
        <Card title={
          <span className="flex items-center gap-xs">
            <Database className="w-4 h-4" />
            Response Cache
          </span>
        }>
          <p className="text-body text-muted mb-md">
            Cache non-streaming responses to avoid redundant upstream calls on retry.
          </p>
          <div className="space-y-lg">
            <label className="flex items-center gap-xs cursor-pointer">
              <input
                type="checkbox"
                checked={cacheConfig.enabled}
                onChange={(e) => updateCacheField('enabled', e.target.checked)}
                className="w-4 h-4 rounded border-hairline text-primary focus:ring-primary"
              />
              <span className="text-sm text-body">Enable response caching</span>
            </label>

            <Input
              label="TTL (ms)"
              type="number"
              value={String(cacheConfig.ttlMs)}
              onChange={(e) => updateCacheField('ttlMs', parseInt(e.target.value) || 10000)}
              placeholder="10000"
            />

            <Input
              label="Max Entries"
              type="number"
              value={String(cacheConfig.maxEntries)}
              onChange={(e) => updateCacheField('maxEntries', parseInt(e.target.value) || 50)}
              placeholder="50"
            />
          </div>
          <div className="mt-md">
            <Button
              variant="secondary"
              onClick={handleSaveCache}
              loading={savingCache}
              loadingText="Saving..."
            >
              Save Cache Config
            </Button>
          </div>
        </Card>
      )}

      <Card title="About">
        <p className="text-body">ClaudeCode Proxy v{appVersion}</p>
        <p className="text-small text-muted mt-xs">
          Route Claude Code requests through the provider offering the best quality/cost ratio.
        </p>
        <div className="mt-md pt-md border-t border-hairline">
          <button
            onClick={handleCheckUpdates}
            disabled={checkingUpdate}
            className="inline-flex items-center gap-xs text-small text-primary hover:text-primary-active font-medium focus-ring rounded px-1 py-0.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
            {checkingUpdate ? 'Checking...' : 'Check for Updates'}
          </button>
          {updateStatus && (
            <span className="ml-sm text-small text-muted">{updateStatus}</span>
          )}
          {updateAvailable && (
            <button
              onClick={() => { openDownloadPage(); setUpdateAvailable(null); setUpdateStatus(null); }}
              className="ml-sm inline-flex items-center gap-xs text-small font-medium text-primary hover:text-primary-active underline"
            >
              Download v{updateAvailable}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
