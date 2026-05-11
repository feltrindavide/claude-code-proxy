import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  loading?: boolean;
  loadingText?: string;
}

const variantStyles: Record<string, string> = {
  primary: 'bg-primary text-white hover:bg-primary-active focus-visible:ring-primary',
  secondary: 'bg-surface-card text-ink border border-hairline-strong hover:bg-canvas-soft focus-visible:ring-primary',
  destructive: 'bg-semantic-error text-white hover:bg-red-700 focus-visible:ring-semantic-error',
  ghost: 'bg-transparent text-ink hover:bg-canvas-soft focus-visible:ring-primary',
};

export function Button({
  variant = 'primary',
  loading = false,
  loadingText,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-xs rounded-md font-medium text-sm focus-ring transition-colors',
        'min-h-[44px] px-[18px] h-10',
        variantStyles[variant],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {loading ? loadingText || children : children}
    </button>
  );
}
