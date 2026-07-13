/**
 * Bundled demo fixtures. Every value satisfies the exact shapes in
 * docs/API_CONTRACT.md so the app renders fully with no backend running.
 *
 * The demo farm has a deliberate spread: two premium reds running too dry
 * (one critical), two over-watered blocks (the "stop watering" differentiator),
 * and blocks holding their glide path. Series data is generated deterministically
 * so the charts are stable across reloads.
 */

import type {
  Backtest,
  BattlePlan,
  BattlePlanRequest,
  BlockCollection,
  BlockFeature,
  BlockPhoto,
  BlockProperties,
  BlockStatus,
  BlockValidation,
  Briefing,
  CacheRefreshResponse,
  CreateBlockRequest,
  DeleteBlockResponse,
  DemoDateRequest,
  DemoDateResponse,
  Driver,
  Glossary,
  GlossaryEntry,
  Health,
  HistoryPoint,
  Insight,
  InsightFact,
  InsightRequest,
  PhotoAnalysis,
  PourSlip,
  ProviderRequest,
  ProviderResponse,
  ScenarioBlock,
  ScenarioRequest,
  SeasonBank,
  Settings,
  Stage,
  Status,
  StressHint,
  TargetBand,
  Timeseries,
  Traffic,
  ValidationReading,
  ValidationReadingRequest,
  ValidationReadingResponse,
  ValidationSeriesPoint,
  WineStyle,
} from '../types/api';
import { ringAreaHa } from '../lib/geo';

export const AS_OF = '2026-01-20';
const SEASON_END = '2026-04-15';
const TAW = 120;

const KC: Record<Stage, number> = {
  dormant: 0.15,
  budbreak: 0.3,
  flowering: 0.45,
  fruit_set: 0.6,
  veraison: 0.7,
  harvest: 0.55,
  post_harvest: 0.4,
};

// ---------- deterministic RNG ----------
// Mock series (timeseries, polygons, glossary facts, etc.) must look random
// but be identical across reloads and across the demo Pages deployment, so we
// never use Math.random(). Every generator below seeds a PRNG from a hash of
// the block id (or similar stable key) instead.

/** Mulberry32: a small, fast, seedable PRNG. Returns a () => number in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash, used to turn a block id into a stable PRNG seed. */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

// ---------- date helpers ----------
const toDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toIso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};
const diffDays = (a: string, b: string): number =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);

// ---------- block definitions ----------
interface BlockDef {
  id: string;
  name: string;
  variety: string;
  wine_style: WineStyle;
  area_ha: number;
  rate: number;
  center: [number, number]; // [lon, lat]
  stage: Stage;
  band: TargetBand;
  f: number; // current depletion fraction
  status: Status;
  score: number;
  traffic: Traffic;
  gdd: number;
  drivers: Driver[];
  /** v2 §A: measured 7-day ETa, latest NDVI, ETa-vs-ETc divergence (%). */
  eta7: number;
  ndvi: number;
  deficit: number;
  /** Engine-verified pour-slip overrides (the Ks-adjusted engine differs
   * slightly from the naive band-midpoint formula). */
  pourMm?: number;
  window?: string;
  holdDays?: number;
  user_created?: boolean;
  geometry?: number[][][];
}

const drivers = (
  et0: number,
  rain: number,
  tmax: number,
  fc: number,
  p: [Driver['pressure'], Driver['pressure'], Driver['pressure'], Driver['pressure']],
): Driver[] => [
  { key: 'et0_7d', label: '7-day ET0', value: et0, unit: 'mm/day', pressure: p[0] },
  { key: 'rain_7d', label: '7-day rainfall', value: rain, unit: 'mm', pressure: p[1] },
  { key: 'tmax_7d', label: '7-day max temp', value: tmax, unit: '°C', pressure: p[2] },
  { key: 'forecast_rain_3d', label: 'Rain next 3 days', value: fc, unit: 'mm', pressure: p[3] },
];

/** v2 §A drivers: present because the mock farm has an ETa/NDVI source. */
const v2drivers = (eta7: number, ndvi: number, deficitPct: number): Driver[] => [
  {
    key: 'eta_7d',
    label: '7-day ETa (measured)',
    value: eta7,
    unit: 'mm/day',
    pressure: deficitPct >= 15 ? 'high' : deficitPct >= 8 ? 'moderate' : 'low',
  },
  {
    key: 'ndvi',
    label: 'NDVI (Sentinel-2)',
    value: ndvi,
    unit: '',
    pressure: ndvi < 0.65 ? 'moderate' : 'low',
  },
  {
    key: 'transpiration_deficit_pct',
    label: 'Transpiration deficit',
    value: deficitPct,
    unit: '%',
    pressure: deficitPct >= 15 ? 'high' : deficitPct >= 8 ? 'moderate' : 'low',
  },
];

// Demo farm spread: pinned to the live engine's FAO-56 Ks-adjusted actuals
// so mock mode (the public Pages demo) matches the backend and docs exactly.
// R6 climax: the flagship premium red B1 reads too_wet after a seeded 28 mm
// over-irrigation event; B4 is the top too-dry block. Climax 2: a seeded 12 mm
// convective cell over B7 two days out lets the Battle Plan skip it on rain.
const BLOCKS: BlockDef[] = [
  {
    id: 'B1', name: 'Bosberg Cabernet', variety: 'Cabernet Sauvignon',
    wine_style: 'premium_red', area_ha: 2.8, rate: 2.0, center: [18.8605, -33.9305],
    stage: 'veraison', band: [0.35, 0.55], f: 0.108, status: 'too_wet',
    score: 48, traffic: 'watch', gdd: 1455.2, holdDays: 7,
    drivers: drivers(4.6, 24.0, 26.5, 9.0, ['low', 'low', 'low', 'low']),
    eta7: 3.3, ndvi: 0.82, deficit: 0,
  },
  {
    id: 'B2', name: 'Skaliekop Shiraz', variety: 'Shiraz',
    wine_style: 'premium_red', area_ha: 3.2, rate: 1.8, center: [18.8712, -33.9302],
    stage: 'veraison', band: [0.35, 0.55], f: 0.6, status: 'too_dry',
    score: 21, traffic: 'stable', gdd: 1362.8,
    window: 'next two nights', // 10 h at 1.8 mm/h cannot fit one night
    drivers: drivers(6.0, 2.0, 32.8, 0.0, ['moderate', 'moderate', 'high', 'moderate']),
    eta7: 3.9, ndvi: 0.7, deficit: 7,
  },
  {
    id: 'B3', name: 'Rivierkant Merlot', variety: 'Merlot',
    wine_style: 'red', area_ha: 2.1, rate: 2.2, center: [18.8808, -33.9312],
    stage: 'veraison', band: [0.35, 0.55], f: 0.45, status: 'on_track',
    score: 11, traffic: 'stable', gdd: 1288.4,
    drivers: drivers(5.2, 6.0, 29.8, 3.0, ['moderate', 'moderate', 'moderate', 'moderate']),
    eta7: 3.4, ndvi: 0.75, deficit: 3,
  },
  {
    // Engine-verified: depletion 85.6 mm, deviation 0.163, pour 28.9 mm / 14.5 h.
    id: 'B4', name: 'Windberg Pinotage', variety: 'Pinotage',
    wine_style: 'red', area_ha: 1.8, rate: 2.0, center: [18.8618, -33.9382],
    stage: 'veraison', band: [0.35, 0.55], f: 0.713, status: 'too_dry',
    score: 55, traffic: 'high', gdd: 1252.6,
    pourMm: 28.9, window: 'next two nights',
    drivers: drivers(6.3, 0.6, 34.6, 0.0, ['high', 'high', 'high', 'high']),
    eta7: 3.6, ndvi: 0.71, deficit: 17.8,
  },
  {
    id: 'B5', name: 'Kloofstroom Chenin', variety: 'Chenin Blanc',
    wine_style: 'white', area_ha: 3.6, rate: 2.4, center: [18.8724, -33.9392],
    stage: 'veraison', band: [0.3, 0.5], f: 0.41, status: 'on_track',
    score: 8, traffic: 'stable', gdd: 1241.0,
    drivers: drivers(5.0, 6.0, 29.5, 0.0, ['moderate', 'moderate', 'moderate', 'moderate']),
    eta7: 3.7, ndvi: 0.78, deficit: 2,
  },
  {
    id: 'B6', name: 'Môrelig Sauvignon', variety: 'Sauvignon Blanc',
    wine_style: 'fresh_white', area_ha: 2.4, rate: 2.4, center: [18.8812, -33.9402],
    stage: 'harvest', band: [0.25, 0.4], f: 0.34, status: 'on_track',
    score: 11, traffic: 'stable', gdd: 1472.6,
    drivers: drivers(5.4, 4.0, 30.0, 2.0, ['moderate', 'moderate', 'moderate', 'moderate']),
    eta7: 3.2, ndvi: 0.72, deficit: 4,
  },
  {
    // Engine-verified: the seeded 12 mm rain event 2 days out softens the
    // 7-day projection, so B7 scores 12 (still too_dry today).
    id: 'B7', name: 'Leiwater Chardonnay', variety: 'Chardonnay',
    wine_style: 'white', area_ha: 1.9, rate: 2.2, center: [18.8662, -33.9468],
    stage: 'veraison', band: [0.3, 0.5], f: 0.54, status: 'too_dry',
    score: 12, traffic: 'stable', gdd: 1207.3,
    drivers: drivers(5.8, 2.5, 31.5, 12.0, ['moderate', 'moderate', 'moderate', 'low']),
    eta7: 3.6, ndvi: 0.73, deficit: 6,
  },
];

// ---------- user-traced blocks (v2 §F) ----------
const VERAISON_BAND: Record<WineStyle, TargetBand> = {
  premium_red: [0.35, 0.55],
  red: [0.35, 0.55],
  white: [0.3, 0.5],
  fresh_white: [0.25, 0.4],
};

const userDefs: BlockDef[] = [];
let userSeq = 0;

/**
 * Registers a user-traced block (Field Mode "trace a block" flow) as a mock
 * fixture: derives its centroid and area from the traced ring, and invents a
 * plausible status by jittering the depletion fraction around the veraison
 * band midpoint for its wine style, so a freshly traced block looks sane
 * on the map and status card without any real sensor history behind it.
 */
export function mockCreateBlock(req: CreateBlockRequest): BlockFeature {
  const id = `U${++userSeq}`;
  const ring = req.geometry.coordinates[0] ?? [];
  const band = VERAISON_BAND[req.wine_style];
  const jitter = ((hash(id + req.name) % 9) - 4) / 100;
  const f = round2(mid(band) + jitter);
  let cx = 0;
  let cy = 0;
  const open = ring.slice(0, Math.max(0, ring.length - 1));
  for (const [x, y] of open) {
    cx += x;
    cy += y;
  }
  const n = Math.max(1, open.length);
  const def: BlockDef = {
    id,
    name: req.name,
    variety: req.variety,
    wine_style: req.wine_style,
    area_ha: ringAreaHa(ring),
    rate: req.application_rate_mm_h,
    center: [cx / n, cy / n],
    stage: 'veraison',
    band,
    f,
    status: 'on_track',
    score: Math.min(25, Math.round(Math.abs(jitter) * 100)),
    traffic: 'stable',
    gdd: 1230 + (hash(id) % 90),
    drivers: drivers(5.4, 4.2, 30.5, 2.0, [
      'moderate',
      'moderate',
      'moderate',
      'moderate',
    ]),
    eta7: 3.5,
    ndvi: 0.73,
    deficit: 4,
    user_created: true,
    geometry: req.geometry.coordinates,
  };
  userDefs.push(def);
  return featureOf(def);
}

export function mockDeleteBlock(id: string): DeleteBlockResponse {
  const idx = userDefs.findIndex((d) => d.id === id);
  if (idx === -1) {
    return { ok: false, error: 'Only user-traced blocks can be deleted.' };
  }
  userDefs.splice(idx, 1);
  return { ok: true };
}

const allDefs = (): BlockDef[] => [...BLOCKS, ...userDefs];

const byId = (id: string): BlockDef => {
  const b = allDefs().find((x) => x.id === id);
  if (!b) throw new Error(`unknown block ${id}`);
  return b;
};

// ---------- polygons ----------
function makePoly(def: BlockDef): number[][][] {
  const [cx, cy] = def.center;
  const side = Math.sqrt(def.area_ha * 10_000); // metres
  const halfLon = side / 2 / 92_400;
  const halfLat = side / 2 / 111_000;
  const rng = mulberry32(hash(def.id));
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const ring = corners.map(([sx, sy]) => {
    const jx = 1 + (rng() - 0.5) * 0.18;
    const jy = 1 + (rng() - 0.5) * 0.18;
    return [
      round2Coord(cx + sx * halfLon * jx),
      round2Coord(cy + sy * halfLat * jy),
    ] as [number, number];
  });
  ring.push([ring[0][0], ring[0][1]]);
  return [ring];
}
const round2Coord = (v: number): number => Math.round(v * 1e6) / 1e6;

function featureOf(def: BlockDef): BlockFeature {
  return {
    type: 'Feature',
    properties: {
      id: def.id,
      name: def.name,
      variety: def.variety,
      wine_style: def.wine_style,
      area_ha: def.area_ha,
      application_rate_mm_h: def.rate,
      taw_mm: TAW,
      ...(def.user_created ? { user_created: true } : {}),
    } satisfies BlockProperties,
    geometry: { type: 'Polygon', coordinates: def.geometry ?? makePoly(def) },
  };
}

export function mockBlocks(): BlockCollection {
  return {
    type: 'FeatureCollection',
    features: allDefs().map(featureOf),
  };
}

// ---------- status ----------
const mid = (band: TargetBand): number => (band[0] + band[1]) / 2;

function pourSlip(def: BlockDef): PourSlip {
  if (def.status === 'too_wet') {
    const holdDays = def.holdDays ?? 6;
    return {
      type: 'hold',
      needed_mm: 0,
      runtime_hours: 0,
      window: 'hold',
      next_check: addDays(AS_OF, holdDays),
      hold_days: holdDays,
    };
  }
  // Per-block override carries the engine's Ks-adjusted figure where the
  // naive band-midpoint formula would drift from the verified actuals.
  const needed = def.pourMm ?? Math.max(0, (def.f - mid(def.band)) * TAW);
  const runtime = round1(needed / def.rate);
  return {
    type: 'pour',
    needed_mm: round1(needed),
    runtime_hours: runtime,
    window: def.window ?? (needed > 0.5 ? 'tonight' : 'optional'),
    next_check: addDays(AS_OF, def.status === 'too_dry' ? 3 : 5),
    hold_days: null,
  };
}

const RECOMMENDATION: Record<string, string> = {
  B1: 'Stop watering Bosberg Cabernet. After the 28 mm over-irrigation it sits 0.24 wetter than its véraison band. More water now dilutes the flagship red and drives excess canopy vigor. Hold ~7 days for ETc to dry it back into band.',
  B2: 'Skaliekop Shiraz is drifting 0.05 past its véraison band: one 18 mm set (10.0 h drip) brings it back to midpoint.',
  B3: 'Rivierkant Merlot is on its véraison glide path. No irrigation needed; recheck 2026-01-24.',
  B4: 'Apply 29 mm (14.5 h drip, split across the next two nights) to bring Windberg Pinotage back onto its véraison glide path (the driest block on the farm).',
  B5: 'Kloofstroom Chenin sits mid-band in véraison: no irrigation this cycle; recheck 2026-01-25.',
  B6: 'Môrelig Sauvignon is holding its harvest band. No irrigation needed; recheck 2026-01-24.',
  B7: 'Leiwater Chardonnay is edging past its véraison band: a light 17 mm (7.6 h) tonight returns it to midpoint, but 12 mm of forecast rain may do the job for free.',
};

/**
 * Depletion fraction → modelled midday stem water potential equivalent (R3).
 * Estimate slope/intercept fitted to the engine's Ks-adjusted mswp_map.json
 * (B4: f 0.713 → −1.34 MPa; B1: f 0.108 → −0.65 MPa). Band targets keep the
 * literature RDI anchors, so the premium-red véraison band [0.35, 0.55] reads
 * [−1.2, −1.0] MPa. Marked "modelled" everywhere it is shown.
 */
export const mswpOfFraction = (f: number): number =>
  round2(-(0.527 + 1.1405 * f));

const mswpBand = (band: TargetBand): [number, number] => [
  round2(-(0.65 + band[1])),
  round2(-(0.65 + band[0])),
];

function statusOf(def: BlockDef): BlockStatus {
  const deviation =
    def.status === 'too_dry'
      ? round3(def.f - def.band[1])
      : def.status === 'too_wet'
        ? round3(def.f - def.band[0])
        : 0;
  return {
    block_id: def.id,
    as_of: AS_OF,
    stage: def.stage,
    gdd: def.gdd,
    depletion_mm: round1(def.f * TAW),
    depletion_fraction: def.f,
    target_band: def.band,
    status: def.status,
    deviation,
    score: def.score,
    traffic: def.traffic,
    drivers: [...def.drivers, ...v2drivers(def.eta7, def.ndvi, def.deficit)],
    recommendation:
      RECOMMENDATION[def.id] ??
      `${def.name} is holding its ${def.stage.replace('_', ' ')} glide path. No irrigation needed; recheck ${addDays(AS_OF, 4)}.`,
    pour_slip: pourSlip(def),
    mswp_estimate_mpa: mswpOfFraction(def.f),
    mswp_band_mpa: mswpBand(def.band),
  };
}

export const mockStatus = (id: string): BlockStatus => statusOf(byId(id));

// ---------- timeseries (glide path) ----------
/**
 * Generates a plausible 45-day history plus a 14-day forecast for a block's
 * glide path. The history is built as a random-walk "sawtooth" (depletion
 * rises with ET0/rain/irrigation daily, occasionally reset by a rain or
 * irrigation event) seeded deterministically from the block id, then the
 * whole series is nudged so its last point lands exactly on the block's
 * current depletion fraction (`def.f`). The forecast continues the same
 * regime-driven drift so dry blocks trend further off-band and wet blocks
 * self-correct toward the band.
 */
export function mockTimeseries(id: string, days = 45): Timeseries {
  const def = byId(id);
  const [lo, hi] = def.band;
  const m = mid(def.band);
  const rng = mulberry32(hash(id) ^ 0x9e3779b9);
  const n = days;

  // Seed a start fraction per regime, then simulate a plausible balance sawtooth.
  let start: number;
  if (def.status === 'too_dry') start = m - 0.03;
  else if (def.status === 'too_wet') start = m + 0.06;
  else start = m + 0.02;

  const kc = KC[def.stage];
  const frac: number[] = [start];
  const et0s: number[] = [];
  const rains: number[] = [];
  const irrs: number[] = [];
  const baseEt0 = def.status === 'too_dry' ? 6.0 : def.status === 'too_wet' ? 4.6 : 5.3;

  for (let i = 1; i < n; i++) {
    const et0 = round1(baseEt0 + (rng() - 0.4) * 1.6);
    let rain = 0;
    // too_wet blocks get a decisive rain event ~10 days before as_of
    if (def.status === 'too_wet' && i >= n - 12 && i <= n - 9) {
      rain = round1(6 + rng() * 8);
    } else if (rng() > 0.82) {
      rain = round1(rng() * 6);
    }
    let irr = 0;
    if (def.status === 'too_dry' && i % 8 === 0) irr = round1(5 + rng() * 4);
    const etc = et0 * kc;
    const d = (etc - rain - irr) / TAW;
    frac.push(clamp(frac[i - 1] + d, 0.04, 0.96));
    et0s.push(et0);
    rains.push(rain);
    irrs.push(irr);
  }
  // pin the last point to the block's real current fraction, distributing the residual
  const residual = def.f - frac[n - 1];
  for (let i = 0; i < n; i++) frac[i] = clamp(frac[i] + residual * (i / (n - 1)), 0.03, 0.97);

  // v2 §A: measured ETa + NDVI channels. Dry blocks throttle over the final
  // stretch (ETa sags below modelled ETc, vigour declines); wet blocks
  // transpire fully with a lush canopy; on-track blocks sit just under ETc.
  const deficitEnd = def.deficit / 100;
  const ndviEnd = def.ndvi;
  const ndviStart =
    def.status === 'too_dry' ? ndviEnd + 0.07 : def.status === 'too_wet' ? ndviEnd - 0.03 : ndviEnd + 0.01;

  const history = frac.map((fVal, i): HistoryPoint => {
    const date = addDays(AS_OF, -(n - 1) + i);
    const et0 = i === 0 ? round1(baseEt0) : et0s[i - 1];
    const etc = round1(et0 * kc);
    const t = i / (n - 1);
    const rampT = clamp((t - 0.6) / 0.4, 0, 1); // throttling builds late
    const deficitT = def.status === 'too_dry' ? deficitEnd * rampT : deficitEnd * t;
    const etaRatio = clamp(
      (def.status === 'too_wet' ? 1.02 : 0.97) - deficitT + (rng() - 0.5) * 0.04,
      0.6,
      1.08,
    );
    const ndvi = round2(ndviStart + (ndviEnd - ndviStart) * t + (rng() - 0.5) * 0.015);
    return {
      date,
      et0,
      etc,
      kc,
      rain: i === 0 ? 0 : rains[i - 1],
      irrigation_mm: i === 0 ? 0 : irrs[i - 1],
      depletion_fraction: round2(fVal),
      band_lo: lo,
      band_hi: hi,
      stage: def.stage,
      eta: round1(etc * etaRatio),
      ndvi,
    };
  });

  // Forecast: drift by regime. Dry drifts further off, wet self-corrects toward lo.
  const forecast = [];
  let pf = def.f;
  for (let j = 1; j <= 14; j++) {
    const et0 = round1(baseEt0 + (rng() - 0.4) * 1.2);
    const etc = et0 * kc;
    let rain = 0;
    if (def.status === 'too_wet' && j <= 2) rain = round1(2 + rng() * 3);
    // The seeded convective cell over B7, two days after as_of (2026-01-22).
    if (def.id === 'B7' && j === 2) rain = 12;
    const drift =
      def.status === 'too_dry'
        ? etc / TAW + 0.002
        : def.status === 'too_wet'
          ? etc / TAW + 0.004 // dries back up toward the band
          : (m - pf) * 0.06 + (rng() - 0.5) * 0.01;
    pf = clamp(pf + drift - rain / TAW, 0.03, 0.97);
    // wet blocks plateau once they re-enter the band
    if (def.status === 'too_wet' && pf > lo) pf = lo + (pf - lo) * 0.4;
    forecast.push({
      date: addDays(AS_OF, j),
      et0,
      etc: round1(etc),
      kc,
      rain,
      depletion_fraction_projected: round2(pf),
      band_lo: lo,
      band_hi: hi,
    });
  }

  return { block_id: id, history, forecast };
}

// ---------- briefing ----------
const HEADLINE: Record<string, string> = {
  B1: 'Too wet: over-irrigated premium red; hold water before dilution.',
  B2: 'Drifting dry: 0.05 past band; one 10 h set brings it back.',
  B3: 'On track in véraison.',
  B4: 'Driest on the farm: 29 mm behind its band; water over the next two nights.',
  B5: 'Mid-band in véraison; holding its glide path.',
  B6: 'On track through harvest.',
  B7: 'Edging dry, but 12 mm of forecast rain closes the deficit for free.',
};

export function mockBriefing(): Briefing {
  return {
    blocks: allDefs()
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((d) => ({
        block_id: d.id,
        name: d.name,
        traffic: d.traffic,
        status: d.status,
        score: d.score,
        headline:
          HEADLINE[d.id] ??
          `Traced block holding its ${d.stage.replace('_', ' ')} glide path.`,
      })),
    farm_summary:
      '3 block(s) need water, 1 too wet, 3 on track. Peak pressure: B4 (55).',
  };
}

export function mockHealth(): Health {
  return {
    status: 'ok',
    provider: settingsState.provider,
    terraclim_ready: settingsState.terraclimReady,
    as_of: settingsState.asOf,
    cache_age_minutes: settingsState.oldestMinutes,
  };
}

// ---------- battle plan (responds to request) ----------
const STAGE_SENS = (s: Stage): number => (s === 'fruit_set' || s === 'veraison' ? 2 : 1);
const STYLE_W: Record<WineStyle, number> = {
  premium_red: 1.3,
  red: 1.15,
  white: 1.0,
  fresh_white: 1.0,
};

/** The block the seeded 12 mm rain cell covers: skipped, never scheduled. */
const RAIN_SKIP_ID = 'B7';

export function mockBattlePlan(req: BattlePlanRequest): BattlePlan {
  const hoursPerDay = Math.max(0.5, req.available_hours_per_day);
  const horizon = Math.max(1, Math.min(7, req.horizon_days));

  const candidates = BLOCKS.filter(
    (d) => d.status === 'too_dry' && d.id !== RAIN_SKIP_ID,
  )
    .map((d) => {
      const dev = d.f - d.band[1];
      const priority = dev * STAGE_SENS(d.stage) * STYLE_W[d.wine_style];
      const neededMm = Math.max(0, (d.f - mid(d.band)) * TAW);
      return { def: d, priority, remainingHours: neededMm / d.rate };
    })
    .sort((a, b) => b.priority - a.priority);

  const plan = [];
  for (let day = 0; day < horizon; day++) {
    let budget = hoursPerDay;
    const entries = [];
    for (let idx = 0; idx < candidates.length && budget > 0.05; idx++) {
      const c = candidates[idx];
      if (c.remainingHours <= 0.05) continue;
      const hours = round1(Math.min(budget, c.remainingHours));
      if (hours < 0.1) continue;
      entries.push({
        block_id: c.def.id,
        hours,
        mm_applied: round1(hours * c.def.rate),
        reason:
          idx === 0
            ? `Highest glide-path deviation (too dry) in ${c.def.stage}; no rain forecast 11 days.`
            : `Elevated glide-path deviation (too dry) in ${c.def.stage}; no rain forecast 11 days.`,
      });
      c.remainingHours -= hours;
      budget -= hours;
    }
    plan.push({ day: addDays(AS_OF, day), entries });
  }

  // Mirrors the engine: too-wet blocks and rain-covered blocks are skipped;
  // on-track blocks simply are not scheduled.
  const skipped = [
    {
      block_id: 'B1',
      reason: 'Currently too wet: irrigation would push it further off path.',
    },
    {
      block_id: RAIN_SKIP_ID,
      reason: '12 mm rain forecast within 48 h closes the deficit without irrigation.',
    },
  ];

  const blocksWatered = new Set(
    plan.flatMap((day) => day.entries.map((e) => e.block_id)),
  ).size;
  const totalAvailable = round1(hoursPerDay * horizon);
  // Engine-verified demo figure: B7's 14.7 mm deficit x 1.65 ha = 243 m³ that
  // the forecast rain delivers instead of the drip lines.
  const waterSaved = 243;

  return {
    as_of: AS_OF,
    plan,
    skipped,
    summary: `${totalAvailable} available hours allocated to ${blocksWatered} of 7 blocks; ${skipped.length} blocks skipped on forecast; est. ${waterSaved.toLocaleString('en-ZA')} m³ water saved.`,
  };
}

// ---------- season bank (responds to remaining_m3) ----------
export function mockSeasonBank(remainingM3 = 12000): SeasonBank {
  const projectedDemand = 15400;
  const daysToEnd = diffDays(AS_OF, SEASON_END);
  const dailyDemand = projectedDemand / daysToEnd;

  // Same two-word vocabulary as the engine: 'sufficient' | 'shortfall'.
  const verdict: SeasonBank['verdict'] =
    remainingM3 >= projectedDemand ? 'sufficient' : 'shortfall';

  const daysToDry = remainingM3 / dailyDemand;
  const runDry =
    remainingM3 >= projectedDemand ? null : addDays(AS_OF, Math.floor(daysToDry));
  const daysShort = remainingM3 >= projectedDemand ? 0 : Math.round(daysToEnd - daysToDry);
  const shortfall = Math.max(0, Math.round((projectedDemand - remainingM3) / 100) * 100);

  const burn_down = [];
  for (let d = 0; d <= daysToEnd; d += 1) {
    const demandToDate = Math.round(dailyDemand * d);
    burn_down.push({
      date: addDays(AS_OF, d),
      bank_m3: Math.max(0, Math.round(remainingM3 - demandToDate)),
      demand_to_date_m3: demandToDate,
    });
  }

  let advice: string;
  if (verdict === 'sufficient') {
    advice = `Bank on track: projected demand ${projectedDemand.toLocaleString('en-ZA')} m³ vs ${remainingM3.toLocaleString('en-ZA')} m³ available.`;
  } else {
    advice = `Projected ${shortfall.toLocaleString('en-ZA')} m³ shortfall before harvest. Tighten the white blocks to their lower band edge to recover ~2,100 m³ and push the run-dry date past ${runDry ? runDry : SEASON_END}.`;
  }

  return {
    as_of: AS_OF,
    remaining_m3: remainingM3,
    projected_demand_m3: projectedDemand,
    verdict,
    run_dry_date: runDry,
    days_short: daysShort,
    burn_down,
    advice,
  };
}

// ---------- scenario (responds to type) ----------
const SCENARIO_DF: Record<ScenarioRequest['type'], number> = {
  heatwave: 0.11,
  drought: 0.06,
  rain_event: -0.13,
  cool_spell: -0.03,
};

const bandDeviation = (f: number, band: TargetBand): number =>
  f > band[1] ? f - band[1] : f < band[0] ? f - band[0] : 0;

/**
 * The contract's canonical score: 0.7 × today's deviation component blended
 * with 0.3 × the projected 7-day deviation component, each |dev|/0.35 × 100
 * (uncapped), a single min(100) cap on the blend, rounded half up.
 */
function scoreCanonical(
  f: number,
  fIn7: number,
  band: TargetBand,
): { status: Status; deviation: number; score: number; traffic: Traffic } {
  const devNow = bandDeviation(f, band);
  const component = (d: number) => (Math.abs(d) / 0.35) * 100;
  const score = Math.min(
    100,
    Math.round(0.7 * component(devNow) + 0.3 * component(bandDeviation(fIn7, band))),
  );
  const status: Status = devNow > 0 ? 'too_dry' : devNow < 0 ? 'too_wet' : 'on_track';
  const traffic: Traffic =
    score <= 25 ? 'stable' : score <= 50 ? 'watch' : score <= 75 ? 'high' : 'critical';
  return { status, deviation: round3(devNow), score, traffic };
}

const SCENARIO_REC: Record<Status, string> = {
  too_dry: 'Deficit widening: bring irrigation forward to defend the glide path.',
  too_wet: 'Dilution risk rising: hold all water and let ETc recover the band.',
  on_track: 'Holds inside the target band under this scenario.',
};

export function mockScenario(req: ScenarioRequest): ScenarioBlock[] {
  const df = SCENARIO_DF[req.type] * (req.days / 7);
  const df7 = SCENARIO_DF[req.type]; // a further 7 days of the same forcing
  return BLOCKS.map((def) => {
    // Baseline: today's state with a flat forward week (no perturbation).
    const base = scoreCanonical(def.f, def.f, def.band);
    const f2 = clamp(def.f + df, 0.03, 0.97);
    const f9 = clamp(f2 + df7, 0.03, 0.97);
    const s = scoreCanonical(f2, f9, def.band);
    const stat = statusOf(def);
    return {
      ...stat,
      depletion_fraction: round2(f2),
      depletion_mm: round1(f2 * TAW),
      status: s.status,
      deviation: s.deviation,
      score: s.score,
      traffic: s.traffic,
      recommendation: SCENARIO_REC[s.status],
      delta: s.score - base.score,
    };
  }).sort((a, b) => b.score - a.score);
}

// ---------- backtest ----------
export function mockBacktest(): Backtest {
  const start = '2025-09-20';
  const end = AS_OF;
  const total = diffDays(start, end);
  const rng = mulberry32(0xba07e57);
  const events = [
    {
      date: '2025-12-04',
      type: 'heat_spike',
      blocks_flagged: ['B5', 'B6', 'B7'],
      lead_days: 8,
      narrative:
        'On data available at the time, the engine projected B7 breaching its band 8 days before the 38°C spike.',
    },
    {
      date: '2026-01-08',
      type: 'heat_spike',
      blocks_flagged: ['B2', 'B4', 'B7'],
      lead_days: 4,
      narrative:
        'Three blocks flagged four days ahead of the 36 °C event on 8 January.',
    },
    {
      date: '2026-01-13',
      type: 'wet_swing',
      blocks_flagged: ['B1'],
      lead_days: 3,
      narrative:
        '12 mm of rain on 13 January on top of a logged 28 mm irrigation pushed B1 below its band; the engine had flagged over-watering risk three days prior.',
    },
  ];

  const eventDays = events.map((e) => diffDays(start, e.date));
  const series = [];
  for (let d = 0; d <= total; d += 3) {
    const seasonRamp = 12 + (d / total) * 26; // farm gets tenser toward peak summer
    let bump = 0;
    let out = 0;
    for (let k = 0; k < eventDays.length; k++) {
      const dist = Math.abs(d - eventDays[k]);
      if (dist <= 6) {
        bump += (18 - k * 3) * (1 - dist / 6);
        out += dist <= 3 ? events[k].blocks_flagged.length : 1;
      }
    }
    const mean = clamp(Math.round(seasonRamp + bump + (rng() - 0.5) * 4), 5, 92);
    series.push({
      date: addDays(start, d),
      farm_mean_score: mean,
      blocks_out_of_band: Math.min(7, out),
    });
  }

  return { window: [start, end], events, series, methodology: 'information_limited' };
}

// ---------- settings (v2 §D) ----------
const settingsState = {
  provider: 'open-meteo' as string,
  terraclimReady: false,
  tokenStatus: 'unset',
  asOf: AS_OF,
  cacheEntries: 21,
  oldestMinutes: 37,
};

export function mockSettings(): Settings {
  return {
    provider: settingsState.provider,
    terraclim_ready: settingsState.terraclimReady,
    token_status: settingsState.tokenStatus,
    cache: {
      entries: settingsState.cacheEntries,
      oldest_minutes: settingsState.oldestMinutes,
    },
    as_of: settingsState.asOf,
    datapack: { loaded: false },
  };
}

export function mockSetProvider(req: ProviderRequest): ProviderResponse {
  const token = req.token?.trim();
  if (req.provider === 'terraclim') {
    if (!token && settingsState.tokenStatus === 'unset') {
      return {
        ok: false,
        error:
          'TerraClim test call failed: 401 Unauthorized (no token). Paste the token issued at kick-off, then press Test & Activate.',
      };
    }
    if (token && token.length < 8) {
      return {
        ok: false,
        error:
          'TerraClim test call failed: 401 Unauthorized (token rejected). Check for a truncated paste and try again.',
      };
    }
    if (token) settingsState.tokenStatus = `set (••••${token.slice(-4)})`;
    settingsState.provider = 'terraclim';
    settingsState.terraclimReady = true;
    return { ok: true, settings: mockSettings() };
  }
  if (req.provider === 'open-meteo') {
    settingsState.provider = 'open-meteo';
    return { ok: true, settings: mockSettings() };
  }
  if (req.provider === 'datapack') {
    return {
      ok: false,
      error:
        'No data pack found at backend/app/data/datapack/. The provider activates automatically once the ET-GEO pack is loaded there.',
    };
  }
  return { ok: false, error: `Unknown provider "${req.provider}".` };
}

export function mockCacheRefresh(): CacheRefreshResponse {
  const defs = allDefs();
  const purged = settingsState.cacheEntries;
  settingsState.cacheEntries = defs.length * 3;
  settingsState.oldestMinutes = 0;
  return {
    ok: true,
    purged,
    rewarmed: defs.map((d) => ({
      block_id: d.id,
      ok: true,
      source: settingsState.provider,
    })),
  };
}

export function mockDemoDate(req: DemoDateRequest): DemoDateResponse {
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.as_of)) settingsState.asOf = req.as_of;
  return { ok: true, as_of: settingsState.asOf };
}

// ---------- validation (v2 §C) ----------
export function mockModelMswpSeries(id: string): ValidationSeriesPoint[] {
  return mockTimeseries(id, 45).history.map((h) => ({
    date: h.date,
    mpa: mswpOfFraction(h.depletion_fraction),
  }));
}

interface ReadingSeed {
  daysAgo: number;
  delta: number;
  note: string | null;
}

const READING_SEEDS: Record<string, ReadingSeed[]> = {
  B1: [
    { daysAgo: 21, delta: -0.06, note: 'Pre-dawn bagged leaf, row 12.' },
    { daysAgo: 12, delta: 0.03, note: null },
    { daysAgo: 4, delta: -0.02, note: 'Midday, clear sky.' },
  ],
  B2: [
    { daysAgo: 15, delta: 0.05, note: null },
    { daysAgo: 5, delta: 0.08, note: 'Vines visibly flagging on the shale bench.' },
  ],
  B3: [{ daysAgo: 8, delta: -0.04, note: 'After the 22 mm rain week.' }],
  B5: [
    { daysAgo: 10, delta: 0.02, note: null },
    { daysAgo: 3, delta: -0.05, note: 'Lush canopy, no stress visible.' },
  ],
};

let readingSeq = 0;
const readingStore = new Map<string, ValidationReading[]>();

function seededReadings(id: string): ValidationReading[] {
  const existing = readingStore.get(id);
  if (existing) return existing;
  const model = mockModelMswpSeries(id);
  const atDate = (date: string) => model.find((p) => p.date === date)?.mpa ?? mswpOfFraction(byId(id).f);
  const list = (READING_SEEDS[id] ?? []).map((seed): ValidationReading => {
    const date = addDays(AS_OF, -seed.daysAgo);
    const modelMpa = atDate(date);
    return {
      reading_id: `R${++readingSeq}`,
      block_id: id,
      date,
      mswp_mpa: round2(modelMpa + seed.delta),
      note: seed.note,
      model_mpa: modelMpa,
      delta_mpa: round2(seed.delta),
    };
  });
  readingStore.set(id, list);
  return list;
}

/**
 * Summary agreement stats between logged pressure-bomb readings and the
 * model's estimate for the same dates: mean bias, RMSE, and the percentage
 * of readings that fall within the block's target band. Mirrors the
 * validation summary the live backend computes in v2 §C.
 */
function agreementOf(id: string, readings: ValidationReading[]) {
  if (!readings.length) return { bias: 0, rmse: 0, n: 0, within_band_pct: 0 };
  const def = byId(id);
  const band = mswpBand(def.band);
  const bandMin = Math.min(band[0], band[1]);
  const bandMax = Math.max(band[0], band[1]);
  const deltas = readings.map((r) => r.delta_mpa ?? 0);
  const bias = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const rmse = Math.sqrt(deltas.reduce((s, d) => s + d * d, 0) / deltas.length);
  const within = readings.filter(
    (r) => r.mswp_mpa >= bandMin && r.mswp_mpa <= bandMax,
  ).length;
  return {
    bias: round2(bias),
    rmse: round2(rmse),
    n: readings.length,
    within_band_pct: Math.round((within / readings.length) * 100),
  };
}

export function mockValidation(id: string): BlockValidation {
  const readings = seededReadings(id)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return {
    block_id: id,
    model_series: mockModelMswpSeries(id),
    readings,
    reference_series: [],
    reference_source: 'pending_datapack',
    agreement: agreementOf(id, readings),
  };
}

export function mockLogReading(req: ValidationReadingRequest): ValidationReadingResponse {
  const model = mockModelMswpSeries(req.block_id);
  const modelMpa =
    model.find((p) => p.date === req.date)?.mpa ??
    model[model.length - 1]?.mpa ??
    mswpOfFraction(byId(req.block_id).f);
  const reading: ValidationReading = {
    reading_id: `R${++readingSeq}`,
    block_id: req.block_id,
    date: req.date,
    mswp_mpa: round2(req.mswp_mpa),
    note: req.note?.trim() || null,
    model_mpa: modelMpa,
    delta_mpa: round2(req.mswp_mpa - modelMpa),
  };
  const list = seededReadings(req.block_id);
  list.push(reading);
  // Same envelope as POST /api/validation/reading on the live backend.
  return {
    reading,
    model_mswp_mpa: modelMpa,
    delta_mpa: round2(req.mswp_mpa - modelMpa),
  };
}

// ---------- photos (v2 §C / R17) ----------
/**
 * Deterministic sample canopy imagery: a leafy scene rendered as an SVG data
 * URI so the whole photo flow demos offline with zero binary assets. Healthy
 * canopies read deep green; stressed ones thinner and yellow-shifted.
 */
function canopySvg(seed: number, yellowFrac: number, coverFrac: number): string {
  const rng = mulberry32(seed);
  const leaves: string[] = [];
  for (let i = 0; i < 110; i++) {
    const x = (rng() * 336 - 8).toFixed(0);
    const y = (34 + rng() * 214).toFixed(0);
    const r = 9 + rng() * 15;
    if (rng() > coverFrac) continue;
    const yellow = rng() < yellowFrac;
    const h = yellow ? 50 + rng() * 12 : 92 + rng() * 34;
    const s = yellow ? 58 + rng() * 14 : 34 + rng() * 26;
    const l = yellow ? 46 + rng() * 12 : 24 + rng() * 18;
    leaves.push(
      `<ellipse cx="${x}" cy="${y}" rx="${r.toFixed(0)}" ry="${(r * 0.68).toFixed(0)}" fill="hsl(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(0)}%)" transform="rotate(${(rng() * 60 - 30).toFixed(0)} ${x} ${y})"/>`,
    );
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">` +
    `<rect width="320" height="240" fill="#7a6749"/>` +
    `<rect width="320" height="34" fill="#c3ccd3"/>` +
    leaves.join('') +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

let photoSeq = 0;
const photoStore = new Map<string, BlockPhoto[]>();

interface PhotoSeed {
  daysAgo: number;
  note: string | null;
  analysis: PhotoAnalysis;
}

const PHOTO_SEEDS: Record<string, PhotoSeed[]> = {
  // B1 is the over-irrigated block: a lush, vigorous canopy corroborates the
  // model's too-wet read.
  B1: [
    {
      daysAgo: 9,
      note: 'Dense canopy after the irrigation run.',
      analysis: {
        gli_mean: 0.22,
        canopy_cover_pct: 76,
        yellowing_pct: 2,
        stress_hint: 'none',
        agrees_with_model: true,
      },
    },
    {
      daysAgo: 2,
      note: 'Vigorous lateral growth, hedging soon.',
      analysis: {
        gli_mean: 0.25,
        canopy_cover_pct: 81,
        yellowing_pct: 2,
        stress_hint: 'none',
        agrees_with_model: true,
      },
    },
  ],
  // B4 is the driest block: declining GLI and visible stress track the model.
  B4: [
    {
      daysAgo: 14,
      note: 'Row 12, western edge.',
      analysis: {
        gli_mean: 0.19,
        canopy_cover_pct: 62,
        yellowing_pct: 6,
        stress_hint: 'mild',
        agrees_with_model: true,
      },
    },
    {
      daysAgo: 2,
      note: 'Same vines, tips wilting by noon.',
      analysis: {
        gli_mean: 0.15,
        canopy_cover_pct: 57,
        yellowing_pct: 12,
        stress_hint: 'visible',
        agrees_with_model: true,
      },
    },
  ],
  B5: [
    {
      daysAgo: 6,
      note: 'Healthy canopy after the rain week.',
      analysis: {
        gli_mean: 0.21,
        canopy_cover_pct: 72,
        yellowing_pct: 3,
        stress_hint: 'none',
        agrees_with_model: true,
      },
    },
  ],
};

function seededPhotos(id: string): BlockPhoto[] {
  const existing = photoStore.get(id);
  if (existing) return existing;
  const list = (PHOTO_SEEDS[id] ?? []).map((seed): BlockPhoto => {
    const a = seed.analysis;
    return {
      photo_id: `P${++photoSeq}`,
      block_id: id,
      date: addDays(AS_OF, -seed.daysAgo),
      url: canopySvg(
        hash(id) ^ seed.daysAgo,
        a.yellowing_pct / 60,
        a.canopy_cover_pct / 100 + 0.15,
      ),
      note: seed.note,
      analysis: a,
    };
  });
  photoStore.set(id, list);
  return list;
}

export function mockPhotos(id: string): BlockPhoto[] {
  return seededPhotos(id)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ---------- AI Insights (v2 §H / R18) ----------
/**
 * Deterministic insight generator mirroring the backend's template renderer:
 * every fact is read from the same canonical engine state the screens show
 * (statuses, slips, plans, events), assembled into grower-language prose.
 * source is always "template" here. Mock mode has no AI leg by design.
 */

const fmtMpaLoc = (v: number): string =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} MPa`;

const stageWords = (s: Stage): string => s.replace('_', ' ');

const STYLE_WORDS: Record<WineStyle, string> = {
  premium_red: 'premium red',
  red: 'red',
  white: 'white',
  fresh_white: 'fresh white',
};

const GLOSSARY: Glossary = [
  {
    term: 'ET0',
    name: 'Reference evapotranspiration (ET0)',
    definition:
      'The drying power of the weather: the water a short, well-watered field would lose to the air in a day. Hot, dry, windy days push ET0 up; the vineyard’s own use scales from it.',
    unit: 'mm/day',
  },
  {
    term: 'ETc',
    name: 'Crop evapotranspiration (ETc)',
    definition:
      'ET0 scaled by the crop coefficient Kc: the water the vines are expected to use at their current growth stage, before any stress throttling.',
    unit: 'mm/day',
  },
  {
    term: 'ETa',
    name: 'Actual evapotranspiration (ETa)',
    definition:
      'The water the vines actually gave up, measured from satellite rather than modelled. When ETa sags below ETc the canopy is throttling: real stress, not a forecast.',
    unit: 'mm/day',
  },
  {
    term: 'Kc',
    name: 'Crop coefficient (Kc)',
    definition:
      'How much of the reference thirst the vineyard actually draws, set by canopy size and stage: 0.30 at budbreak up to 0.70 at véraison. Multiply ET0 by Kc to get expected vine water use.',
  },
  {
    term: 'Ks',
    name: 'Stress coefficient (Ks)',
    definition:
      'The FAO-56 throttle: once soil depletion passes the readily-available threshold, vines cannot drink at full rate, so daily use is cut by Ks. It keeps the balance honest in dry spells.',
  },
  {
    term: 'NDVI',
    name: 'Normalised difference vegetation index (NDVI)',
    definition:
      'A satellite greenness score from 0 to 1: how much healthy leaf area the block carries. A vigorous canopy reads 0.75+; a declining NDVI corroborates water stress.',
  },
  {
    term: 'GDD',
    name: 'Growing degree days (GDD)',
    definition:
      'Accumulated heat since 1 September: each day adds the mean temperature above 10 °C. GDD drives the phenology clock: budbreak, flowering, véraison and harvest each arrive at known GDD marks.',
  },
  {
    term: 'MSWP',
    name: 'Midday stem water potential (MSWP)',
    definition:
      'The pressure-bomb reading, in MPa (negative: more negative is drier). It is the grower’s ground truth for vine stress: bag a leaf, squeeze it in the chamber at midday, read the gauge. Vino maps its modelled depletion onto this scale.',
    unit: 'MPa',
  },
  {
    term: 'RDI',
    name: 'Regulated deficit irrigation (RDI)',
    definition:
      'Deliberately under-watering at the right stage: enough stress to concentrate flavour and control vigour, never enough to stall ripening. The glide path is RDI made visible.',
  },
  {
    term: 'TAW',
    name: 'Total available water (TAW)',
    definition:
      'The water the root zone can hold between full and wilting: 120 mm for these soils. Depletion is expressed as a fraction of TAW so every block reads on the same scale.',
    unit: 'mm',
  },
  {
    term: 'depletion',
    name: 'Soil-water depletion',
    definition:
      'How much of the root-zone reservoir the vines have used, as a fraction of TAW. 0.00 is a full profile, 1.00 is empty. Each day adds vine water use and subtracts rain and irrigation.',
  },
  {
    term: 'glide path',
    name: 'Stress glide path',
    definition:
      'The target depletion band for each growth stage and wine style. Riding inside the band applies the right deficit at the right time; above it the vines are too dry, below it the water is diluting the wine.',
  },
  {
    term: 'zonal statistics',
    name: 'Zonal statistics',
    definition:
      'Satellite rasters averaged over the block’s exact traced polygon rather than a grid cell, so a value belongs to your rows, not to a square kilometre of mixed farmland.',
  },
];

export function mockGlossary(): Glossary {
  return GLOSSARY;
}

const TERM_ALIAS: Record<string, string> = {
  et0: 'ET0', eto: 'ET0', etc: 'ETc', eta: 'ETa', kc: 'Kc', ks: 'Ks',
  ndvi: 'NDVI', gdd: 'GDD', mswp: 'MSWP', mpa: 'MSWP', 'pressure bomb': 'MSWP',
  rdi: 'RDI', taw: 'TAW', depletion: 'depletion',
  'glide path': 'glide path', glide_path: 'glide path',
  'zonal statistics': 'zonal statistics', zonal_statistics: 'zonal statistics',
};

function glossaryEntry(raw: string): GlossaryEntry | null {
  const key = TERM_ALIAS[raw.trim().toLowerCase()] ?? raw.trim();
  return GLOSSARY.find((g) => g.term.toLowerCase() === key.toLowerCase()) ?? null;
}

/** Live per-block value for a glossary term, when one exists. */
function termFact(term: string, def: BlockDef): InsightFact | null {
  switch (term) {
    case 'ET0': {
      const d = def.drivers.find((x) => x.key === 'et0_7d');
      return d ? { label: `${def.id} 7-day ET0`, value: `${d.value} mm/day` } : null;
    }
    case 'ETa':
      return { label: `${def.id} 7-day ETa`, value: `${def.eta7} mm/day` };
    case 'Kc':
      return { label: `${def.id} Kc (${stageWords(def.stage)})`, value: KC[def.stage].toFixed(2) };
    case 'NDVI':
      return { label: `${def.id} latest NDVI`, value: def.ndvi.toFixed(2) };
    case 'GDD':
      return { label: `${def.id} accumulated`, value: `${Math.round(def.gdd)} GDD` };
    case 'MSWP':
      return { label: `${def.id} modelled MSWP`, value: fmtMpaLoc(mswpOfFraction(def.f)) };
    case 'TAW':
      return { label: `${def.id} TAW`, value: `${TAW} mm` };
    case 'depletion':
      return { label: `${def.id} depletion`, value: `${def.f.toFixed(2)} of TAW` };
    case 'glide path':
      return {
        label: `${def.id} ${stageWords(def.stage)} band`,
        value: `${def.band[0].toFixed(2)}–${def.band[1].toFixed(2)}`,
      };
    default:
      return null;
  }
}

/** Grower-language template per driver key: same wording family as the backend. */
const DRIVER_TEXT: Record<string, { what: string; effect: string }> = {
  et0_7d: {
    what: 'the drying power of the weather over the last week: the millimetres a day the sun, heat, wind and dry air would pull from a well-watered canopy',
    effect: 'Every millimetre of it must come out of the soil tank or the drip line, so a high week empties the root zone fast.',
  },
  rain_7d: {
    what: 'effective rainfall banked over the last week (days under 2 mm don’t count; they evaporate off leaves and hot soil before they soak in)',
    effect: 'Rain refills the root zone for free; a dry week leaves irrigation as the only inflow.',
  },
  tmax_7d: {
    what: 'the average daily maximum temperature over the last week',
    effect: 'Heat drives the vines’ thirst, and days much above 35 °C make them shut their leaf pores and risk scorched fruit.',
  },
  forecast_rain_3d: {
    what: 'rain the forecast promises within the next three days',
    effect: 'Meaningful forecast rain lets the engine hold irrigation back rather than double-water.',
  },
  eta_7d: {
    what: 'the water the vines actually gave up last week, measured by satellite rather than modelled',
    effect: 'When measured ETa sags below the modelled expectation, the canopy is already throttling.',
  },
  ndvi: {
    what: 'satellite canopy greenness on the most recent clear pass',
    effect: 'A slipping NDVI corroborates stress; a lush one on a wet block flags excess vigour.',
  },
  transpiration_deficit_pct: {
    what: 'how far actual transpiration (ETa) runs below the stage expectation (ETc)',
    effect: 'Above ~15% the vines are visibly rationing water: the strongest single stress signal here.',
  },
};

const PRESSURE_WORDS: Record<Driver['pressure'], string> = {
  high: 'pushing hard on this block right now',
  moderate: 'a moderate influence this week',
  low: 'quiet at the moment',
};

const SCENARIO_WORDS: Record<ScenarioRequest['type'], { label: string; forcing: string }> = {
  heatwave: { label: 'heatwave', forcing: '+6 °C and roughly +30% atmospheric demand' },
  drought: { label: 'drought', forcing: 'all forecast rain removed' },
  rain_event: { label: 'rain event', forcing: '+25 mm of rain over two days' },
  cool_spell: { label: 'cool spell', forcing: '−5 °C and about −20% atmospheric demand' },
};

const ctxStr = (ctx: Record<string, unknown> | undefined, key: string): string | null => {
  const v = ctx?.[key];
  return typeof v === 'string' && v ? v : null;
};
const ctxNum = (ctx: Record<string, unknown> | undefined, key: string): number | null => {
  const v = ctx?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

const MODELLED_CAVEAT =
  'Modelled estimate: log a pressure-bomb reading to calibrate.';

/**
 * Builds the headline/explanation/facts/caveats for one insight request by
 * switching on `subject_type`. Every branch reads from the same canonical
 * mock state (statuses, slips, plans, backtest events) that the rest of this
 * file already computes, then narrates it in the same grower-facing voice
 * the live backend's template renderer uses, so mock and live insights read
 * as one product regardless of which is serving the app.
 */
function insightOf(req: InsightRequest): Omit<Insight, 'source' | 'subject_type'> {
  const blockId = req.block_id ?? ctxStr(req.context, 'block_id') ?? undefined;
  const def = blockId ? byId(blockId) : null;

  switch (req.subject_type) {
    case 'block_status': {
      if (!def) break;
      const s = statusOf(def);
      const band = `${def.band[0].toFixed(2)}–${def.band[1].toFixed(2)}`;
      const headline =
        s.status === 'too_dry'
          ? `${def.name} is too dry: ${s.deviation.toFixed(2)} past its ${stageWords(def.stage)} band`
          : s.status === 'too_wet'
            ? `${def.name} is too wet: ${Math.abs(s.deviation).toFixed(2)} below its ${stageWords(def.stage)} band`
            : `${def.name} is riding its ${stageWords(def.stage)} glide path`;
      const statusSentence =
        s.status === 'too_dry'
          ? 'The vines have drawn past the deficit the wine style wants, so irrigation is due.'
          : s.status === 'too_wet'
            ? 'The soil is wetter than the deliberate deficit calls for: more water now works against the wine.'
            : 'No correction is needed; the deficit is doing its work on the fruit.';
      return {
        headline,
        explanation:
          `The engine runs a daily water balance for this block: vine use (ET0 × Kc, throttled by stress) out, rain and irrigation in. ` +
          `Depletion sits at ${s.depletion_fraction.toFixed(2)} of the ${TAW} mm root-zone tank against a ${band} target for ${STYLE_WORDS[def.wine_style]} in ${stageWords(def.stage)}. ${statusSentence}`,
        facts: [
          { label: 'Status', value: s.status.replace('_', ' ') },
          { label: 'Depletion', value: `${s.depletion_fraction.toFixed(2)} of TAW (${s.depletion_mm.toFixed(0)} mm)` },
          { label: 'Target band', value: band },
          { label: 'Deviation', value: s.deviation === 0 ? 'in band' : s.deviation.toFixed(2) },
          { label: 'Stage', value: `${stageWords(def.stage)} · ${Math.round(def.gdd)} GDD` },
        ],
        caveats: ['Water balance is modelled from weather and logged irrigation.', MODELLED_CAVEAT],
      };
    }

    case 'score': {
      if (!def) break;
      const s = statusOf(def);
      return {
        headline: `Why ${def.id} scores ${s.score}`,
        explanation:
          `The score blends how far the block sits off its band today (70% weight) with where the 7-day projection puts it (30%). ` +
          `A drift of 0.35 past the band reads 100: that is the full scale. ` +
          `Today's deviation is ${s.deviation === 0 ? 'zero (inside the band)' : s.deviation.toFixed(2)}, which lands the block at ${s.score} and a "${s.traffic}" flag. Higher scores simply mean "look here first".`,
        facts: [
          { label: 'Score', value: `${s.score} / 100` },
          { label: 'Traffic', value: s.traffic },
          { label: "Today's deviation", value: s.deviation === 0 ? '0.00 (in band)' : s.deviation.toFixed(2) },
          { label: 'Weighting', value: '70% today · 30% 7-day projection' },
        ],
        caveats: ['The score ranks attention across blocks; it is not a damage estimate.'],
      };
    }

    case 'driver': {
      if (!def || !req.subject_id) break;
      const s = statusOf(def);
      const d = s.drivers.find((x) => x.key === req.subject_id);
      if (!d) throw new Error(`unknown driver ${req.subject_id}`);
      const t = DRIVER_TEXT[d.key];
      return {
        headline: `${d.label}: ${d.value}${d.unit ? ` ${d.unit}` : ''}`,
        explanation:
          `This driver is ${t ? t.what : 'one of the signals the engine weighs for this block'}. ` +
          `${t ? t.effect : ''} Right now it reads ${d.value}${d.unit ? ` ${d.unit}` : ''}, ${PRESSURE_WORDS[d.pressure]}.`,
        facts: [
          { label: d.label, value: `${d.value}${d.unit ? ` ${d.unit}` : ''}` },
          { label: 'Pressure', value: d.pressure },
          { label: 'Block', value: `${def.id} · ${def.name}` },
        ],
        caveats:
          d.key === 'eta_7d' || d.key === 'ndvi' || d.key === 'transpiration_deficit_pct'
            ? ['Satellite-derived over the traced block polygon (zonal statistics); cloud gaps are filled by the model.']
            : ['From the active weather provider for this exact block location.'],
      };
    }

    case 'mswp': {
      if (!def) break;
      const s = statusOf(def);
      const est = s.mswp_estimate_mpa ?? mswpOfFraction(def.f);
      const band = s.mswp_band_mpa ?? [0, 0];
      return {
        headline: `≈ ${fmtMpaLoc(est)} modelled stem water potential`,
        explanation:
          `This translates the block's soil-water depletion into the unit a pressure bomb reads: midday stem water potential, where more negative means drier vines. ` +
          `Depletion of ${def.f.toFixed(2)} maps to about ${fmtMpaLoc(est)}; the ${stageWords(def.stage)} target for this wine style is ${fmtMpaLoc(Math.max(band[0], band[1]))} to ${fmtMpaLoc(Math.min(band[0], band[1]))}. It exists so the model and your gauge speak the same language.`,
        facts: [
          { label: 'Modelled MSWP', value: fmtMpaLoc(est) },
          { label: 'Target band', value: `${fmtMpaLoc(Math.max(band[0], band[1]))} to ${fmtMpaLoc(Math.min(band[0], band[1]))}` },
          { label: 'From depletion', value: `${def.f.toFixed(2)} of TAW` },
        ],
        caveats: [MODELLED_CAVEAT],
      };
    }

    case 'glide_path': {
      if (!def) break;
      const band = `${def.band[0].toFixed(2)}–${def.band[1].toFixed(2)}`;
      return {
        headline: `The ${stageWords(def.stage)} glide path for ${def.name}`,
        explanation:
          `The shaded band is the deliberate deficit this ${STYLE_WORDS[def.wine_style]} block should ride through ${stageWords(def.stage)}: keep depletion between ${band} of the root-zone tank. ` +
          `Enough stress concentrates the berries and tames vigour; past the top of the band the vines start rationing and ripening suffers. The solid line is 45 days of measured balance, the dashed line the 14-day projection.`,
        facts: [
          { label: 'Target band', value: `${band} of TAW` },
          { label: 'Current depletion', value: def.f.toFixed(2) },
          { label: 'Stage · style', value: `${stageWords(def.stage)} · ${STYLE_WORDS[def.wine_style]}` },
          { label: 'Window', value: '45 d measured + 14 d projected' },
        ],
        caveats: ['Band targets follow FAO-56 / RDI literature per stage and wine style.'],
      };
    }

    case 'pour_slip': {
      if (!def) break;
      const s = statusOf(def);
      const slip = s.pour_slip;
      if (slip.type === 'hold') {
        return {
          headline: `Hold water on ${def.name}: ${slip.hold_days} day${slip.hold_days === 1 ? '' : 's'}`,
          explanation:
            `The block sits wetter than the bottom of its ${stageWords(def.stage)} band, so any irrigation now pushes it further off path, diluting flavour and feeding canopy instead of fruit. ` +
            `With no water added, daily vine use dries the profile back into band in about ${slip.hold_days} day${slip.hold_days === 1 ? '' : 's'}; recheck on ${slip.next_check}.`,
          facts: [
            { label: 'Instruction', value: 'hold: no irrigation' },
            { label: 'Est. days to band', value: `${slip.hold_days}` },
            { label: 'Next check', value: slip.next_check },
          ],
          caveats: ['Re-evaluated daily as weather lands; rain extends the hold.'],
        };
      }
      return {
        headline: `Pour ${slip.needed_mm.toFixed(1)} mm: ${slip.runtime_hours.toFixed(1)} h of drip`,
        explanation:
          `The slip aims the block back at the middle of its band, not at a full profile: the vines keep the working thirst the wine wants. ` +
          `The gap between today's depletion and the band midpoint is ${slip.needed_mm.toFixed(1)} mm. ` +
          `The drip line puts down ${def.rate} mm/h, which makes ${slip.runtime_hours.toFixed(1)} hours of pumping, scheduled "${slip.window}" ${slip.runtime_hours > 8 ? 'because the run does not fit a single night set' : 'so it lands with low evaporation'}.`,
        facts: [
          { label: 'Water needed', value: `${slip.needed_mm.toFixed(1)} mm` },
          { label: 'Runtime', value: `${slip.runtime_hours.toFixed(1)} h @ ${def.rate} mm/h` },
          { label: 'Window', value: slip.window },
          { label: 'Next check', value: slip.next_check },
        ],
        caveats: ['Assumes the logged application rate is what the lines actually deliver.'],
      };
    }

    case 'battle_plan_entry': {
      if (!def) break;
      const day = ctxStr(req.context, 'day');
      const hours = ctxNum(req.context, 'hours');
      const mm = ctxNum(req.context, 'mm') ?? ctxNum(req.context, 'mm_applied');
      const dev = round3(def.f - def.band[1]);
      const sens = STAGE_SENS(def.stage);
      const w = STYLE_W[def.wine_style];
      return {
        headline: `Why ${def.name} gets water${day ? ` on ${day}` : ''}`,
        explanation:
          `The plan ranks thirsty blocks by glide-path deviation, multiplied by stage sensitivity and wine value, then fills each day's pumping budget from the top. ` +
          `${def.id} is ${dev.toFixed(2)} past its band in ${stageWords(def.stage)} (a ×${sens} sensitivity stage) as a ${STYLE_WORDS[def.wine_style]} block (×${w.toFixed(2)} value weight)${hours != null ? `, earning ${hours.toFixed(1)} h${mm != null ? ` (${mm.toFixed(1)} mm)` : ''} of the budget` : ''}.`,
        facts: [
          ...(day ? [{ label: 'Scheduled day', value: day }] : []),
          ...(hours != null ? [{ label: 'Allocated', value: `${hours.toFixed(1)} h${mm != null ? ` · ${mm.toFixed(1)} mm` : ''}` }] : []),
          { label: 'Band deviation', value: dev.toFixed(2) },
          { label: 'Stage sensitivity', value: `×${sens} (${stageWords(def.stage)})` },
          { label: 'Style weight', value: `×${w.toFixed(2)} (${STYLE_WORDS[def.wine_style]})` },
        ],
        caveats: ['Re-solve the plan after any unforecast rain; priorities shift.'],
      };
    }

    case 'battle_plan_skip': {
      if (!def) break;
      const day = ctxStr(req.context, 'day');
      const wet = def.status === 'too_wet';
      const rain = def.id === RAIN_SKIP_ID;
      const explanation = wet
        ? `${def.name} is already wetter than its band: watering it would push it further off path and dilute the wine, so its share of the budget goes to blocks that need it.`
        : rain
          ? `The forecast puts 12 mm of rain on ${def.name} within 48 hours, enough to close its deficit without running the pump. Skipping it leaves that water in the dam.`
          : `${def.name} is inside its target band, so it earns no water this cycle; the budget concentrates on blocks that are off path.`;
      return {
        headline: `Why ${def.name} is skipped${day ? ` on ${day}` : ''}`,
        explanation,
        facts: [
          { label: 'Reason', value: wet ? 'too wet: hold' : rain ? 'rain covers the deficit' : 'already in band' },
          { label: 'Status', value: def.status.replace('_', ' ') },
          { label: 'Depletion vs band', value: `${def.f.toFixed(2)} vs ${def.band[0].toFixed(2)}–${def.band[1].toFixed(2)}` },
        ],
        caveats: rain
          ? ['If the forecast rain fails to land, the block re-enters the plan on the next solve.']
          : ['Re-evaluated on every plan solve.'],
      };
    }

    case 'season_bank': {
      const remaining = ctxNum(req.context, 'remaining_m3') ?? 12000;
      const bank = mockSeasonBank(remaining);
      const short = bank.verdict === 'shortfall' || bank.verdict === 'tight';
      return {
        headline: short
          ? `The dam runs dry around ${bank.run_dry_date ?? 'season end'}`
          : 'The dam carries you through harvest',
        explanation:
          `The bank weighs the remaining ${remaining.toLocaleString('en-ZA')} m³ in the dam against every block's projected glide-path demand to season end (${bank.projected_demand_m3.toLocaleString('en-ZA')} m³). ` +
          (short
            ? `At the current burn rate the water runs out ${bank.days_short} day${bank.days_short === 1 ? '' : 's'} short of harvest. Tightening the white blocks to the lower edge of their bands is the cheapest way to close the gap.`
            : `Projected demand fits inside the bank with margin, so no ration is needed. Keep pouring to the glide paths.`),
        facts: [
          { label: 'Remaining', value: `${remaining.toLocaleString('en-ZA')} m³` },
          { label: 'Projected demand', value: `${bank.projected_demand_m3.toLocaleString('en-ZA')} m³` },
          { label: 'Verdict', value: short ? 'shortfall' : 'sufficient' },
          ...(bank.run_dry_date ? [{ label: 'Run-dry date', value: bank.run_dry_date }] : []),
          ...(bank.days_short > 0 ? [{ label: 'Days short', value: `${bank.days_short}` }] : []),
        ],
        caveats: ['Demand projection uses forecast weather and stage Kc, so it moves as the season does.'],
      };
    }

    case 'backtest_event': {
      const date = req.subject_id ?? ctxStr(req.context, 'date');
      const e = mockBacktest().events.find((x) => x.date === date);
      if (!e) throw new Error(`unknown backtest event ${date}`);
      return {
        headline: `Caught ${e.lead_days} days early: ${e.type.replace('_', ' ')} on ${e.date}`,
        explanation:
          `${e.narrative} ` +
          `The replay is information-limited: on each simulated day the engine saw only the data available up to that day plus its own forward projection. No hindsight. "Caught early" means the projection breached the band before the event landed.`,
        facts: [
          { label: 'Event', value: e.type.replace('_', ' ') },
          { label: 'Date', value: e.date },
          { label: 'Lead time', value: `${e.lead_days} days` },
          { label: 'Blocks flagged', value: e.blocks_flagged.join(', ') },
        ],
        caveats: ['Replay of the recorded season, not a guarantee of future lead times.'],
      };
    }

    case 'scenario_delta': {
      if (!def) break;
      const typeRaw = ctxStr(req.context, 'type') ?? req.subject_id ?? 'heatwave';
      const type = (typeRaw in SCENARIO_DF ? typeRaw : 'heatwave') as ScenarioRequest['type'];
      const days = ctxNum(req.context, 'days') ?? 7;
      const dfr = SCENARIO_DF[type] * (days / 7);
      const base = scoreCanonical(def.f, def.f, def.band);
      const f2 = clamp(def.f + dfr, 0.03, 0.97);
      const sc = scoreCanonical(f2, clamp(f2 + SCENARIO_DF[type], 0.03, 0.97), def.band);
      const delta = sc.score - base.score;
      const words = SCENARIO_WORDS[type];
      return {
        headline: `${def.name} under a ${days}-day ${words.label}: ${delta > 0 ? '+' : ''}${delta}`,
        explanation:
          `The what-if applies ${words.forcing} to the forward window and re-runs the same water balance. ` +
          `Depletion moves from ${def.f.toFixed(2)} to about ${f2.toFixed(2)}, ${delta > 0 ? 'pushing the block further off' : delta < 0 ? 'easing the block back toward' : 'leaving the block level with'} its band; the score ${delta > 0 ? 'rises' : delta < 0 ? 'falls' : 'holds'} from ${base.score} to ${sc.score}. Blocks that jump are the ones to pre-empt.`,
        facts: [
          { label: 'Scenario', value: `${words.label}, ${days} days` },
          { label: 'Score', value: `${base.score} → ${sc.score} (${delta > 0 ? '+' : ''}${delta})` },
          { label: 'Depletion', value: `${def.f.toFixed(2)} → ${f2.toFixed(2)}` },
          { label: 'Forcing', value: words.forcing },
        ],
        caveats: ['A stress test on the projection, not a forecast.'],
      };
    }

    case 'photo_analysis': {
      const pid = req.subject_id ?? ctxStr(req.context, 'photo_id');
      if (def) seededPhotos(def.id);
      let photo: BlockPhoto | undefined;
      for (const list of photoStore.values()) {
        photo = list.find((p) => p.photo_id === pid);
        if (photo) break;
      }
      if (!photo) throw new Error(`unknown photo ${pid}`);
      const a = photo.analysis;
      const pdef = byId(photo.block_id);
      return {
        headline: a.agrees_with_model
          ? `The canopy photo backs the model's read of ${pdef.id}`
          : `The canopy photo disagrees with the model on ${pdef.id}`,
        explanation:
          `The app scores the photo with plain colour math, not ML: it picks out the canopy pixels by their green hue, then GLI, calculated as (2G−R−B)/(2G+R+B), measures how healthily green they are, alongside canopy cover and yellowing. ` +
          `This capture reads GLI ${a.gli_mean.toFixed(2)} with ${a.canopy_cover_pct}% cover and ${a.yellowing_pct}% yellowing: ${a.stress_hint === 'none' ? 'no visible stress' : `${a.stress_hint} stress`}, which ${a.agrees_with_model ? 'matches' : 'does not match'} the model's "${pdef.status.replace('_', ' ')}" read.`,
        facts: [
          { label: 'GLI (greenness)', value: a.gli_mean.toFixed(2) },
          { label: 'Canopy cover', value: `${a.canopy_cover_pct}%` },
          { label: 'Yellowing', value: `${a.yellowing_pct}%` },
          { label: 'Stress hint', value: a.stress_hint },
          { label: 'Vs model', value: a.agrees_with_model ? 'agrees' : 'differs' },
        ],
        caveats: ['A screening heuristic from phone-camera colour: light and angle matter; it flags, it does not diagnose.'],
      };
    }

    case 'term': {
      const raw = req.subject_id ?? ctxStr(req.context, 'term') ?? '';
      const entry = glossaryEntry(raw);
      if (!entry) throw new Error(`unknown term ${raw}`);
      const facts: InsightFact[] = [];
      if (entry.unit) facts.push({ label: 'Unit', value: entry.unit });
      if (def) {
        const f = termFact(entry.term, def);
        if (f) facts.push(f);
      }
      return {
        headline: entry.name,
        explanation: entry.definition,
        facts,
        caveats: [],
      };
    }
  }
  throw new Error(`cannot explain ${req.subject_type}`);
}

export function mockInsight(req: InsightRequest): Insight {
  return { ...insightOf(req), source: 'template', subject_type: req.subject_type };
}

/**
 * Deterministic screening analysis for an uploaded photo in mock mode: the
 * numbers derive from a hash of the file's name + size (stable per file) and
 * the agrees-with-model flag from the block's current status.
 */
export function mockAnalysePhoto(
  id: string,
  file: { name: string; size: number },
  note: string | null,
  objectUrl: string,
): BlockPhoto {
  const def = byId(id);
  const h = hash(`${file.name}:${file.size}`);
  const gli = round2(0.13 + ((h >>> 3) % 12) / 100);
  const stress: StressHint = gli < 0.16 ? 'visible' : gli < 0.2 ? 'mild' : 'none';
  const agrees =
    def.status === 'too_dry'
      ? stress !== 'none'
      : def.status === 'too_wet'
        ? gli >= 0.2
        : stress === 'none';
  const photo: BlockPhoto = {
    photo_id: `P${++photoSeq}`,
    block_id: id,
    date: AS_OF,
    url: objectUrl,
    note,
    analysis: {
      gli_mean: gli,
      canopy_cover_pct: 52 + ((h >>> 7) % 30),
      yellowing_pct: stress === 'visible' ? 9 + (h % 6) : stress === 'mild' ? 4 + (h % 4) : h % 3,
      stress_hint: stress,
      agrees_with_model: agrees,
    },
  };
  seededPhotos(id).push(photo);
  return photo;
}
