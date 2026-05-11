interface StatusDotProps {
  state: 'running' | 'stopped' | 'error' | 'loading';
  size?: 'sm' | 'lg';
}

const stateColors: Record<StatusDotProps['state'], string> = {
  running: 'bg-semantic-success',
  stopped: 'bg-muted',
  error: 'bg-semantic-error',
  loading: 'bg-primary animate-pulse',
};

const sizeClasses: Record<string, string> = {
  sm: 'w-2 h-2',
  lg: 'w-4 h-4',
};

export function StatusDot({ state, size = 'sm' }: StatusDotProps) {
  return (
    <div
      className={`rounded-pill ${stateColors[state]} ${sizeClasses[size]}`}
      aria-label={`Proxy status: ${state}`}
      role="status"
    />
  );
}
