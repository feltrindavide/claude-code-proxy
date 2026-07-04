'use client';
import { useEffect } from 'react';

export default function PopupLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'popup-override';
    style.textContent = `
      body {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        border-radius: 10px;
        background: var(--color-canvas) !important;
        color: var(--color-ink) !important;
        font-family: 'JetBrains Mono', 'SF Mono', monospace !important;
      }
      body > div {
        width: 100% !important;
        max-width: 100% !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('popup-override')?.remove(); };
  }, []);

  return children;
}
