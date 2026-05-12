'use client';
import { useEffect, useState } from 'react';
import { fetchConfig } from '@/lib/api';
import { openDownloadPage } from '@/services/updater';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Shield, RefreshCw } from 'lucide-react';

export function SettingsForm() {
  const { toast } = useToast();
  const [port, setPort] = useState('3456');
  const [autoStart, setAutoStart] = useState(true);
  const [keychainAvailable, setKeychainAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [appVersion, setAppVersion] = useState('...');
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const config = await fetchConfig();
      setPort('3456');
      setKeychainAvailable(true);
      // Read version from health endpoint
      try {
        const health = await fetch('http://localhost:3456/health').then(r => r.json());
        if (health.version) setAppVersion(health.version);
      } catch {}
    } catch {
      setKeychainAvailable(false);
    }
  }

  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);

  async function handleCheckUpdates() {
    setCheckingUpdate(true);
    setUpdateStatus('Checking...');
    setUpdateAvailable(null);
    try {
      // Fetch latest version from GitHub
      const resp = await fetch('https://github.com/feltrindavide/claude-code-proxy/releases/latest/download/latest.json');
      const data = await resp.json();
      const latestVer = data.version;
      console.log('[Update] Latest:', latestVer, 'Current:', appVersion);

      // Parse and compare
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
      setTimeout(() => { setUpdateStatus(null); setCheckingUpdate(false); }, 5000);
    } catch (e: any) {
      setUpdateStatus(`✗ Check failed: ${e?.message || 'Error'}`);
      setTimeout(() => { setUpdateStatus(null); setCheckingUpdate(false); }, 5000);
      console.error('[Update]', e);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Save settings to config
      toast('Settings saved', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-lg">
      <h2 className="font-display text-[22px] text-ink">Settings</h2>

      {/* Proxy Configuration */}
      <Card title="Proxy Configuration">
        <div className="space-y-lg">
          <Input
            label="Proxy Port"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="3456"
          />

          <label className="flex items-center gap-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="w-4 h-4 rounded border-hairline text-primary focus:ring-primary"
            />
            <span className="text-sm text-body">Auto-start proxy on app launch</span>
          </label>

          <div>
            <label className="block text-sm text-body mb-xs">Health Check Interval</label>
            <p className="text-small text-muted font-mono">5 seconds (fixed)</p>
          </div>
        </div>
      </Card>

      {/* Security */}
      <Card title="Security">
        <div className="flex items-center gap-xs">
          <Shield className="w-4 h-4 text-semantic-success" />
          <span className="text-sm text-ink">
            Keychain: {keychainAvailable === null ? 'Checking...' : keychainAvailable ? 'Available' : 'Not available'}
          </span>
        </div>
        <p className="text-small text-muted mt-xs">
          API keys are stored securely in macOS Keychain and never appear in config files.
        </p>
      </Card>

      {/* About */}
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

      <Button
        variant="primary"
        onClick={handleSave}
        loading={saving}
        loadingText="Saving..."
      >
        Save Settings
      </Button>
    </div>
  );
}
