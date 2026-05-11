import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, type, ...props }: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  return (
    <div className="space-y-xs">
      {label && (
        <label className="block text-sm text-body">{label}</label>
      )}
      <div className="relative">
        <input
          type={inputType}
          className={cn(
            'w-full bg-surface-card text-ink border rounded-md text-body focus-ring transition-colors',
            'h-11 px-4',
            error ? 'border-semantic-error' : 'border-hairline focus:border-primary',
            className
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink focus-ring"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && (
        <p className="text-small text-semantic-error" role="alert">{error}</p>
      )}
    </div>
  );
}
