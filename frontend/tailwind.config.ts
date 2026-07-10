import type { Config } from 'tailwindcss';
import { color, font, radius, shadow } from './src/theme/tokens';

/**
 * Tailwind extends directly from the design tokens so there is exactly one
 * source of truth. Add design values in src/theme/tokens.ts, not here.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: color.paper,
        surface: color.surface,
        raised: color.raised,
        ink: color.ink,
        'ink-soft': color.inkSoft,
        'ink-muted': color.inkMuted,
        line: color.line,
        'line-strong': color.lineStrong,
        bordeaux: {
          DEFAULT: color.bordeaux,
          dark: color.bordeauxDark,
          soft: color.bordeauxSoft,
          tint: color.bordeauxTint,
        },
        slate: {
          DEFAULT: color.slate,
          soft: color.slateSoft,
          tint: color.slateTint,
        },
        stable: { DEFAULT: color.stable, tint: color.stableTint },
        watch: { DEFAULT: color.watch, tint: color.watchTint },
        high: { DEFAULT: color.high, tint: color.highTint },
        critical: { DEFAULT: color.critical, tint: color.criticalTint },
        wet: { DEFAULT: color.wet, soft: color.wetSoft, tint: color.wetTint },
        grid: color.grid,
        axis: color.axis,
      },
      fontFamily: {
        display: [font.display],
        sans: [font.sans],
        mono: [font.mono],
      },
      borderRadius: {
        sm: radius.sm,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
        pill: radius.pill,
      },
      boxShadow: {
        card: shadow.card,
        raised: shadow.raised,
        panel: shadow.panel,
      },
      maxWidth: {
        content: '1440px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-in': 'slide-in 240ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
