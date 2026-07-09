'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-md">
      <h2 className="font-heading text-lg text-ink">Settings error</h2>
      <p className="text-body text-semantic-error" role="alert">{error.message}</p>
      <div className="flex gap-md">
        <Button variant="primary" onClick={reset}>Retry</Button>
        <Link href="/"><Button variant="secondary">Status</Button></Link>
      </div>
    </div>
  );
}
