'use client';

import { Activity, Server, Route, Settings, ScrollText, Boxes } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { normalizeRoute } from '@/lib/routes';

const navItems = [
  { label: 'Status', href: '/', icon: Activity },
  { label: 'Providers', href: '/providers', icon: Server },
  { label: 'Models', href: '/models', icon: Boxes },
  { label: 'Model Mapping', href: '/mapping', icon: Route },
  { label: 'Routing Log', href: '/logs', icon: ScrollText },
  { label: 'Settings', href: '/settings', icon: Settings },
];

function isNavActive(pathname: string, href: string): boolean {
  const path = normalizeRoute(pathname);
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="flex-1 py-lg" aria-label="Main navigation">
      <ul className="space-y-sm mt-sm">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <li key={href}>
              <button
                type="button"
                onClick={() => router.push(href)}
                className={`
                  w-full flex items-center gap-xs px-md py-md text-body text-left focus-ring
                  ${active
                    ? 'border-l-2 border-primary bg-canvas-soft text-ink font-medium'
                    : 'border-l-2 border-transparent hover:bg-canvas-soft'
                  }
                `}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="text-sm">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
