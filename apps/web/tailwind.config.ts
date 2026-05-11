import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-canvas)',
        'canvas-soft': 'var(--color-canvas-soft)',
        primary: 'var(--color-primary)',
        'primary-active': 'var(--color-primary-active)',
        ink: 'var(--color-ink)',
        body: 'var(--color-body)',
        'body-strong': 'var(--color-body-strong)',
        muted: 'var(--color-muted)',
        'muted-soft': 'var(--color-muted-soft)',
        hairline: 'var(--color-hairline)',
        'hairline-soft': 'var(--color-hairline-soft)',
        'hairline-strong': 'var(--color-hairline-strong)',
        'surface-card': 'var(--color-surface-card)',
        'surface-strong': 'var(--color-surface-strong)',
        'semantic-success': 'var(--color-semantic-success)',
        'semantic-error': 'var(--color-semantic-error)',
      },
      fontFamily: {
        sans: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        display: ['22px', { lineHeight: '1.3', letterSpacing: '-0.11px', fontWeight: '400' }],
        heading: ['18px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '600' }],
        body: ['16px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        small: ['14px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
      },
      spacing: {
        xxs: '4px',
        xs: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        pill: '9999px',
      },
    },
  },
  plugins: [],
} satisfies Config;
