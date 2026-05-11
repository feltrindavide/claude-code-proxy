'use client';
import { Shield } from 'lucide-react';
import { StatusCard } from './StatusCard';

interface ProviderHealthCardProps {
  healthyCount: number;
  totalCount: number;
}

export function ProviderHealthCard({ healthyCount, totalCount }: ProviderHealthCardProps) {
  const allHealthy = healthyCount === totalCount && totalCount > 0;
  return (
    <StatusCard
      label="Provider Health"
      value={`${healthyCount} of ${totalCount}`}
      icon={Shield}
      valueColor={allHealthy ? 'text-semantic-success' : 'text-semantic-error'}
    />
  );
}
