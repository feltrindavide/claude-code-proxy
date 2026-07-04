'use client';
import { SettingsForm } from '@/components/SettingsForm';
import { ConfigExportImport } from '@/components/ConfigExportImport';
import { ContextEditor } from '@/components/ContextEditor';
import { ModelAliasForm } from '@/components/ModelAliasForm';

import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { PluginMarketplace } from '@/components/PluginMarketplace';

export default function SettingsPage() {
  return (
    <div className="space-y-xl max-w-2xl mx-auto">
      <SettingsForm />
      <ProfileSwitcher />
      <PluginMarketplace />
      <ModelAliasForm />
      <ConfigExportImport />
      <ContextEditor />
    </div>
  );
}
