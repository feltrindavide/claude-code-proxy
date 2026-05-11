'use client';
import { X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      className="border-l-4 border-semantic-error bg-canvas px-md py-xs rounded-r-md flex items-start justify-between"
      role="alert"
      aria-live="polite"
    >
      <p className="text-small text-semantic-error flex-1">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-md text-semantic-error hover:text-red-700 focus-ring"
          aria-label="Dismiss error"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
