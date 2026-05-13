'use client';
import { SettingsForm } from '@/components/SettingsForm';
import { ConfigExportImport } from '@/components/ConfigExportImport';
import { ContextEditor } from '@/components/ContextEditor';

export default function SettingsPage() {
  return (
    <div className="space-y-xl">
      <SettingsForm />
      <ConfigExportImport />
      <ContextEditor />
    </div>
  );
}
