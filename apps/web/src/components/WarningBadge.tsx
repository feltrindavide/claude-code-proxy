'use client';
import { AlertTriangle } from 'lucide-react';

interface WarningBadgeProps {
  message: string;
}

export function WarningBadge({ message }: WarningBadgeProps) {
  return (
    <span className="inline-flex items-center gap-xxs bg-semantic-error/10 text-semantic-error text-[11px] font-semibold uppercase tracking-[0.88px] rounded-pill px-[10px] py-xxs">
      <AlertTriangle className="w-3 h-3" />
      {message}
    </span>
  );
}
