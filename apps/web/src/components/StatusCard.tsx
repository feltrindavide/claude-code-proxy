import { LucideIcon } from 'lucide-react';

interface StatusCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  valueColor?: string;
}

export function StatusCard({ label, value, icon: Icon, valueColor }: StatusCardProps) {
  return (
    <div className="bg-surface-card rounded-lg border border-hairline p-md">
      <div className="flex items-center gap-xxs mb-xs">
        {Icon && <Icon className="w-3 h-3 text-muted" />}
        <span className="text-[11px] font-semibold uppercase tracking-[0.88px] text-muted">
          {label}
        </span>
      </div>
      <p className={`font-heading text-[18px] font-semibold ${valueColor || 'text-ink'}`}>{value}</p>
    </div>
  );
}
