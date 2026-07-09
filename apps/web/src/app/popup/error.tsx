'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function PopupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 12, fontFamily: 'monospace', fontSize: 11 }}>
      <p role="alert" style={{ color: 'var(--color-semantic-error)', marginBottom: 8 }}>{error.message}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={reset} style={{ fontSize: 10 }}>Retry</button>
        <Link href="/"><Button variant="secondary">Dashboard</Button></Link>
      </div>
    </div>
  );
}
