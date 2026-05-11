'use client';
import { SettingsForm } from '@/components/SettingsForm';
import { ConfigExportImport } from '@/components/ConfigExportImport';

export default function SettingsPage() {
  return (
    <div className="space-y-xl">
      <SettingsForm />
      <ConfigExportImport />
    </div>
  );
}
