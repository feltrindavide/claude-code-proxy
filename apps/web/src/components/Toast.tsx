'use client';
import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let nextId = 0;
const listeners: Set<(toasts: ToastItem[]) => void> = new Set();
let toasts: ToastItem[] = [];

function notify() {
  listeners.forEach((fn) => fn([...toasts]));
}

export function useToast() {
  const [items, setItems] = useState<ToastItem[]>(toasts);

  useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setItems(newToasts);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++;
    toasts = [...toasts, { id, message, type }];
    notify();
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      notify();
    }, 3000);
  }, []);

  const dismiss = useCallback((id: number) => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, []);

  return { toasts: items, toast, dismiss };
}

const typeStyles: Record<ToastType, string> = {
  success: 'border-l-4 border-semantic-success bg-surface-card',
  error: 'border-l-4 border-semantic-error bg-surface-card',
  warning: 'border-l-4 border-semantic-error bg-surface-card',
};

const typeIcons: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
};

export function ToastContainer() {
  const { toasts: items, dismiss } = useToast();

  if (items.length === 0) return null;

  return (
    <div className="fixed top-lg right-lg z-50 space-y-xs" aria-live="polite">
      {items.map((t) => {
        const Icon = typeIcons[t.type];
        return (
          <div
            key={t.id}
            className={`${typeStyles[t.type]} rounded-md border border-hairline px-md py-xs flex items-center gap-xs min-w-[280px]`}
            role="alert"
          >
            <Icon className={`w-4 h-4 ${t.type === 'success' ? 'text-semantic-success' : 'text-semantic-error'}`} />
            <span className="text-small text-ink flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-ink focus-ring"
              aria-label="Dismiss notification"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
