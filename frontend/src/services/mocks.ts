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
  Health,
  HistoryPoint,
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

/** v2 §A drivers — present because the mock farm has an ETa/NDVI source. */
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

// Demo farm spread — pinned to the live engine's FAO-56 Ks-adjusted actuals
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
  B1: 'Stop watering Bosberg Cabernet. After the 28 mm over-irrigation it sits 0.24 wetter than its véraison band — more water now dilutes the flagship red and drives excess canopy vigor. Hold ~7 days for ETc to dry it back into band.',
  B2: 'Skaliekop Shiraz is drifting 0.05 past its véraison band — one 18 mm set (10.0 h drip) brings it back to midpoint.',
  B3: 'Rivierkant Merlot is on its véraison glide path. No irrigation needed; recheck 2026-01-24.',
  B4: 'Apply 29 mm (14.5 h drip, split across the next two nights) to bring Windberg Pinotage back onto its véraison glide path — the driest block on the farm.',
  B5: 'Kloofstroom Chenin sits mid-band in véraison — no irrigation this cycle; recheck 2026-01-25.',
  B6: 'Môrelig Sauvignon is holding its harvest band. No irrigation needed; recheck 2026-01-24.',
  B7: 'Leiwater Chardonnay is edging past its véraison band — a light 17 mm (7.6 h) tonight returns it to midpoint, but 12 mm of forecast rain may do the job for free.',
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

  // Forecast: drift by regime — dry drifts further off, wet self-corrects toward lo.
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
  B1: 'Too wet — over-irrigated premium red; hold water before dilution.',
  B2: 'Drifting dry — 0.05 past band; one 10 h set brings it back.',
  B3: 'On track in véraison.',
  B4: 'Driest on the farm — 29 mm behind its band; water over the next two nights.',
  B5: 'Mid-band in véraison; holding its glide path.',
  B6: 'On track through harvest.',
  B7: 'Edging dry — but 12 mm of forecast rain closes the deficit for free.',
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

/** The block the seeded 12 mm rain cell covers — skipped, never scheduled. */
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
      reason: 'Currently too wet — irrigation would push it further off path.',
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
  too_dry: 'Deficit widening — bring irrigation forward to defend the glide path.',
  too_wet: 'Dilution risk rising — hold all water and let ETc recover the band.',
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
        'No data pack found at backend/app/data/datapack/ — the provider activates automatically once the ET-GEO pack is loaded there.',
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
      note: 'Vigorous lateral growth — hedging soon.',
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
      note: 'Same vines — tips wilting by noon.',
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
