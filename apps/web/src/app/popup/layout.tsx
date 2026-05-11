'use client';
import { useEffect } from 'react';

export default function PopupLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // The theme is inherited from the root ThemeProvider
    // which sets data-theme on <html>
    const style = document.createElement('style');
    style.id = 'popup-override';
    style.textContent = `
      body {
        margin: 0 !important; padding: 0 !important;
        overflow: hidden !important; border-radius: 10px;
        background: var(--color-canvas) !important;
        color: var(--color-ink) !important;
        font-family: 'JetBrains Mono', 'SF Mono', monospace !important;
      }
      aside, nav, .sidebar, [class*="Sidebar"], [class*="sidebar"],
      [class*="SidebarNav"], [class*="AppShell"] > :first-child {
        display: none !important;
      }
      main, [class*="AppShell"] > :last-child, [class*="main"] {
        padding: 0 !important; margin: 0 !important;
        width: 350px !important; max-width: 350px !important;
      }
      body > div {
        max-width: 350px !important; overflow: hidden !important;
      }
      .flex.min-h-screen, [class*="flex"][class*="min-h-screen"] {
        display: block !important; min-height: auto !important;
      }
      *, *::before, *::after {
        transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease !important;
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('popup-override')?.remove(); };
  }, []);

  return children;
}
