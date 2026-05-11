'use client';
import { useProxyStore } from '@/stores/proxyStore';
import { StatusDot } from './StatusDot';

export function SidebarHeader() {
  const { status } = useProxyStore();

  return (
    <header className="px-md pb-md pt-lg border-b border-hairline flex items-center gap-xs">
      <img src="/icon.png" alt="" className="w-5 h-5" />
      <h1 className="font-display text-ink text-[22px] leading-[1.3] tracking-[-0.11px] font-normal flex-1">
        ClaudeCode Proxy
      </h1>
      <StatusDot state={status} size="sm" />
    </header>
  );
}
