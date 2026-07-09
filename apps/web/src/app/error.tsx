'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-lg">
      <div className="max-w-md text-center space-y-md">
        <h1 className="font-display text-2xl text-ink">Something went wrong</h1>
        <p className="text-body text-muted" role="alert">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex gap-md justify-center">
          <Button variant="primary" onClick={reset}>Try again</Button>
          <Link href="/">
            <Button variant="secondary">Go home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
