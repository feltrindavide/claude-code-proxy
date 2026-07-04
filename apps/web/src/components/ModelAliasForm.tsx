'use client';

import { useEffect, useState } from 'react';
import { fetchAliases, saveAliases } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Tags } from 'lucide-react';

const PRESET_ALIASES = [
  { key: 'fast', label: 'fast', hint: 'Quick/cheap tasks (maps to Haiku tier model)' },
  { key: 'smart', label: 'smart', hint: 'Best quality (maps to Opus tier model)' },
  { key: 'free', label: 'free', hint: 'Free-tier provider model' },
] as const;

export function ModelAliasForm() {
  const { toast } = useToast();
  const [aliases, setAliases] = useState<Record<string, string>>({
    fast: '',
    smart: '',
    free: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchAliases()
      .then((data) => setAliases({
        fast: data.aliases.fast || '',
        smart: data.aliases.smart || '',
        free: data.aliases.free || '',
        ...data.aliases,
      }))
      .catch(() => toast('Failed to load aliases', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  function updateAlias(key: string, value: string) {
    setAliases((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const cleaned: Record<string, string> = {};
      for (const [key, value] of Object.entries(aliases)) {
        if (value.trim()) cleaned[key] = value.trim();
      }
      await saveAliases(cleaned);
      toast('Model aliases saved', 'success');
    } catch {
      toast('Failed to save aliases', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-body">Loading aliases...</p>;
  }

  return (
    <Card title={
      <span className="flex items-center gap-xs">
        <Tags className="w-4 h-4" />
        Model Aliases
      </span>
    }>
      <p className="text-body text-muted mb-md">
        Map short names to real Claude model IDs. Use them in Claude Code as{' '}
        <code className="font-mono text-small bg-canvas-soft px-1 rounded">model: &quot;fast&quot;</code>.
      </p>

      <div className="space-y-md">
        {PRESET_ALIASES.map(({ key, label, hint }) => (
          <div key={key}>
            <Input
              label={label}
              value={aliases[key] || ''}
              onChange={(e) => updateAlias(key, e.target.value)}
              placeholder={`e.g. claude-haiku-4-20250514`}
            />
            <p className="text-[11px] text-muted mt-xs">{hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-md">
        <Button variant="secondary" onClick={() => void handleSave()} loading={saving} loadingText="Saving...">
          Save Aliases
        </Button>
      </div>
    </Card>
  );
}
