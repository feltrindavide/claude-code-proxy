'use client';

import { useEffect, useState } from 'react';
import { fetchProfiles, activateProfile, saveProfileSnapshot } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/Toast';

export function ProfileSwitcher() {
  const { toast } = useToast();
  const [active, setActive] = useState('default');
  const [profiles, setProfiles] = useState<string[]>(['default']);
  const [newProfileName, setNewProfileName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchProfiles().then((data) => {
      setActive(data.activeProfile);
      setProfiles(data.profiles);
    });
  }, []);

  async function handleChange(name: string) {
    try {
      await activateProfile(name);
      setActive(name);
      toast(`Switched to profile "${name}"`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Switch failed', 'error');
    }
  }

  async function handleSaveCurrent() {
    const name = newProfileName.trim() || active;
    if (!name) return;
    setSaving(true);
    try {
      await saveProfileSnapshot(name);
      setActive(name);
      const data = await fetchProfiles();
      setProfiles(data.profiles);
      setNewProfileName('');
      toast(`Saved current config to profile "${name}"`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Config profiles">
      <p className="text-sm text-muted mb-md">Switch between saved configuration profiles (Work / Personal).</p>
      <Select
        value={active}
        onChange={(v) => void handleChange(v)}
        options={profiles.map((p) => ({ value: p, label: p }))}
      />
      <div className="mt-md flex gap-2 items-end">
        <Input
          label="Save current as"
          value={newProfileName}
          onChange={(e) => setNewProfileName(e.target.value)}
          placeholder={active}
        />
        <Button variant="secondary" onClick={() => void handleSaveCurrent()} loading={saving}>
          Save snapshot
        </Button>
      </div>
    </Card>
  );
}
