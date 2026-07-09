import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-lg">
      <div className="max-w-md text-center space-y-md">
        <h1 className="font-display text-2xl text-ink">Page not found</h1>
        <p className="text-body text-muted">The page you requested does not exist.</p>
        <Link href="/">
          <Button variant="primary">Back to Status</Button>
        </Link>
      </div>
    </div>
  );
}
