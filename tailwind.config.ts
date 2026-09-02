import type { Config } from 'tailwindcss';

/**
 * Colors are wired to CSS custom properties declared in `src/app/globals.css`,
 * so light/dark swap in one place. Values come from the validated data-viz
 * palette (see README § Design tokens) — do not hand-pick new hexes here.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        plane: 'var(--plane)',
        surface: {
          DEFAULT: 'var(--surface-1)',
          raised: 'var(--surface-2)',
          sunken: 'var(--surface-0)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        hairline: 'var(--hairline)',
        grid: 'var(--gridline)',
        series: {
          1: 'var(--series-1)',
          2: 'var(--series-2)',
          3: 'var(--series-3)',
        },
        status: {
          good: 'var(--status-good)',
          warning: 'var(--status-warning)',
          serious: 'var(--status-serious)',
          critical: 'var(--status-critical)',
        },
        tint: {
          good: 'var(--tint-good)',
          warning: 'var(--tint-warning)',
          serious: 'var(--tint-serious)',
          critical: 'var(--tint-critical)',
        },
        delta: {
          up: 'var(--delta-up)',
          down: 'var(--delta-down)',
        },
        seq: {
          100: 'var(--seq-100)',
          250: 'var(--seq-250)',
          400: 'var(--seq-400)',
          550: 'var(--seq-550)',
          700: 'var(--seq-700)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          from: 'var(--accent-from)',
          to: 'var(--accent-to)',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 2px var(--shadow-1), 0 8px 24px -12px var(--shadow-2)',
        lift: '0 2px 4px var(--shadow-1), 0 18px 40px -16px var(--shadow-2)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};

export default config;
