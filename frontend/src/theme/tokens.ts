/**
 * Vino design tokens: the single source of truth for every design value.
 * Tailwind (tailwind.config.ts) and the app both read from here, so the team
 * can re-skin the product by editing this one file.
 *
 * Palette intent: a calm agronomy / wine cellar tool. Deep bordeaux as the
 * brand, cool slate for structure, warm paper neutrals for surfaces. Traffic
 * lights run green → amber → orange → red. The `wet` blue is reserved for the
 * "you are over-watering" signal and never used for anything else.
 *
 * Keep this module pure data (no imports, no browser APIs). Tailwind loads it
 * in Node at build time.
 */

export const color = {
  // Warm neutral surfaces & ink
  paper: '#f4f1ea',
  surface: '#fbfaf6',
  raised: '#ffffff',
  ink: '#221f1d',
  inkSoft: '#57514b',
  inkMuted: '#8b847b',
  line: '#e4ded3',
  lineStrong: '#d3cabb',

  // Bordeaux: the brand
  bordeaux: '#6b2436',
  bordeauxDark: '#4e1926',
  bordeauxSoft: '#8a3a4c',
  bordeauxTint: '#f1e2e5',

  // Slate: cool structural secondary
  slate: '#33404a',
  slateSoft: '#5a6b78',
  slateTint: '#e8ecef',

  // Traffic-light severity (reserved status colors).
  // Values validated with the dataviz palette checker against `surface`:
  // lightness band, chroma floor, contrast and CVD separation all pass; the
  // watch/high amber-orange pair sits in the 8-12 dE floor band, which is why
  // status is never shown as color alone (chips carry labels, too_wet adds a
  // hatch texture on the map).
  stable: '#2f8a4c',
  watch: '#c1841c',
  high: '#d4693a',
  critical: '#9a2723',

  // Tints of the severity colors for soft fills / washes
  stableTint: '#e6eee7',
  watchTint: '#f6ecd7',
  highTint: '#f7e6da',
  criticalTint: '#f3ddda',

  // The over-watering signal: cool water blue, reserved for too_wet
  wet: '#2f6f9f',
  wetSoft: '#5a93bd',
  wetTint: '#e2edf4',

  // Chart chrome
  grid: '#ece7dd',
  axis: '#c9c0b2',
} as const;

export const font = {
  display: '"Fraunces Variable", "Fraunces", Georgia, "Times New Roman", serif',
  sans: '"Archivo Variable", "Archivo", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", "Roboto Mono", "Menlo", monospace',
} as const;

/** 4px base spacing unit: the whole layout is a multiple of this. */
export const spaceUnit = 4;

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '10px',
  xl: '14px',
  pill: '999px',
} as const;

export const shadow = {
  card: '0 1px 2px rgba(34,31,29,0.04), 0 1px 3px rgba(34,31,29,0.05)',
  raised: '0 2px 6px rgba(34,31,29,0.06), 0 6px 16px rgba(34,31,29,0.07)',
  panel: '-10px 0 40px rgba(34,31,29,0.14)',
} as const;

/** The one blessed brand color surfaced to the PWA manifest / theme-color. */
export const themeColor = color.bordeaux;

/**
 * Traffic-light palette keyed by the contract's `traffic` field, plus the
 * three status states. Components map severity → color through this table so
 * the mapping lives in exactly one place.
 */
export const traffic = {
  stable: { base: color.stable, tint: color.stableTint, label: 'Stable' },
  watch: { base: color.watch, tint: color.watchTint, label: 'Watch' },
  high: { base: color.high, tint: color.highTint, label: 'High' },
  critical: { base: color.critical, tint: color.criticalTint, label: 'Critical' },
} as const;

export const statusColor = {
  on_track: { base: color.stable, tint: color.stableTint, label: 'On track' },
  too_dry: { base: color.high, tint: color.highTint, label: 'Too dry' },
  too_wet: { base: color.wet, tint: color.wetTint, label: 'Too wet' },
} as const;

export const tokens = {
  color,
  font,
  spaceUnit,
  radius,
  shadow,
  themeColor,
  traffic,
  statusColor,
} as const;

export type TrafficKey = keyof typeof traffic;
export type StatusKey = keyof typeof statusColor;

export default tokens;
