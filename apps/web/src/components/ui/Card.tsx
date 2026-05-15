import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  title?: string | React.ReactNode;
  className?: string;
}

export function Card({ children, title, className }: CardProps) {
  return (
    <div className={cn('bg-surface-card rounded-lg border border-hairline p-md', className)}>
      {title && (
        typeof title === 'string'
          ? <h3 className="font-heading text-[18px] font-semibold text-ink mb-md">{title}</h3>
          : <div className="mb-md">{title}</div>
      )}
      {children}
    </div>
  );
}
