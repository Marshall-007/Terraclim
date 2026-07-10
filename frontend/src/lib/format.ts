/** Small, dependency-free formatting helpers used across screens. */

export const fmtHours = (h: number): string => `${h.toFixed(1)} h`;

export const fmtMm = (mm: number): string =>
  `${mm.toFixed(mm < 10 && mm % 1 !== 0 ? 1 : 0)} mm`;

export const fmtFraction = (f: number): string => f.toFixed(2);

export const fmtPercent = (f: number, digits = 0): string =>
  `${(f * 100).toFixed(digits)}%`;

export const fmtM3 = (m3: number): string => `${Math.round(m3).toLocaleString('en-ZA')} m³`;

export const fmtGdd = (gdd: number): string =>
  `${gdd.toLocaleString('en-ZA', { maximumFractionDigits: 0 })} GDD`;

export const fmtSigned = (n: number, digits = 0): string =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;

/** −1.15 MPa (true minus sign, 2 decimals) */
export const fmtMpa = (mpa: number): string =>
  `${mpa < 0 ? '−' : ''}${Math.abs(mpa).toFixed(2)} MPa`;

/**
 * −1.00 to −1.20 MPa — always reads from the wetter (less negative) target to
 * the drier one, regardless of the API's array ordering.
 */
export const fmtMpaBand = (band: [number, number]): string => {
  const one = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
  return `${one(Math.max(band[0], band[1]))} to ${one(Math.min(band[0], band[1]))} MPa`;
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const parseISO = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/** 20 Jan */
export const fmtDayMonth = (iso: string): string => {
  const dt = parseISO(iso);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
};

/** Tue 20 Jan */
export const fmtLongDate = (iso: string): string => {
  const dt = parseISO(iso);
  return `${WEEKDAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
};

/** Tue 20 Jan 2026 */
export const fmtFullDate = (iso: string): string => {
  const dt = parseISO(iso);
  return `${WEEKDAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};

/** Whole days between two ISO dates (b − a). */
export const daysBetween = (a: string, b: string): number => {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86_400_000);
};
