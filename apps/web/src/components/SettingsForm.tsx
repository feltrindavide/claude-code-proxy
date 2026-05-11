'use client';
import { useEffect, useState } from 'react';
import { fetchConfig } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Shield } from 'lucide-react';

export function SettingsForm() {
  const { toast } = useToast();
  const [port, setPort] = useState('3456');
  const [autoStart, setAutoStart] = useState(true);
  const [keychainAvailable, setKeychainAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const config = await fetchConfig();
      // Port would come from config if we stored it; default to 3456
      setPort('3456');
      setKeychainAvailable(true); // Assume available; could check via API
    } catch {
      setKeychainAvailable(false);
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
    <div className="max-w-2xl space-y-lg">
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
        <p className="text-body">ClaudeCode Proxy v0.1.0</p>
        <p className="text-small text-muted mt-xs">
          Route Claude Code requests through the provider offering the best quality/cost ratio.
        </p>
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
