import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--brand-primary) / <alpha-value>)',
        accent: 'rgb(var(--brand-accent) / <alpha-value>)',
        warn: 'rgb(var(--brand-warn) / <alpha-value>)',
        danger: 'rgb(var(--brand-danger) / <alpha-value>)',
        bg: 'rgb(var(--surface-bg) / <alpha-value>)',
        card: 'rgb(var(--surface-card) / <alpha-value>)',
        fg: 'rgb(var(--text-primary) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        line: 'rgb(var(--border) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
