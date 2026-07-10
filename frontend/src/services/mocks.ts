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

const BLOCKS: BlockDef[] = [
  {
    id: 'B1', name: 'Bosberg Cabernet', variety: 'Cabernet Sauvignon',
    wine_style: 'premium_red', area_ha: 2.8, rate: 2.0, center: [18.8605, -33.9305],
    stage: 'veraison', band: [0.35, 0.55], f: 0.66, status: 'too_dry',
    score: 64, traffic: 'high', gdd: 1455.2,
    drivers: drivers(6.4, 0.8, 34.2, 0.0, ['high', 'high', 'high', 'high']),
    eta7: 3.7, ndvi: 0.64, deficit: 17,
  },
  {
    id: 'B2', name: 'Skaliekop Shiraz', variety: 'Shiraz',
    wine_style: 'premium_red', area_ha: 3.2, rate: 1.8, center: [18.8712, -33.9302],
    stage: 'veraison', band: [0.35, 0.55], f: 0.71, status: 'too_dry',
    score: 82, traffic: 'critical', gdd: 1362.8,
    drivers: drivers(6.6, 0.4, 35.1, 0.0, ['high', 'high', 'high', 'high']),
    eta7: 3.5, ndvi: 0.61, deficit: 21,
  },
  {
    id: 'B3', name: 'Rivierkant Merlot', variety: 'Merlot',
    wine_style: 'red', area_ha: 2.1, rate: 2.2, center: [18.8808, -33.9312],
    stage: 'veraison', band: [0.35, 0.55], f: 0.24, status: 'too_wet',
    score: 46, traffic: 'watch', gdd: 1288.4,
    drivers: drivers(4.6, 22.0, 26.8, 8.0, ['low', 'low', 'low', 'low']),
    eta7: 3.3, ndvi: 0.83, deficit: 0,
  },
  {
    id: 'B4', name: 'Windberg Pinotage', variety: 'Pinotage',
    wine_style: 'red', area_ha: 1.8, rate: 2.0, center: [18.8618, -33.9382],
    stage: 'fruit_set', band: [0.4, 0.6], f: 0.5, status: 'on_track',
    score: 9, traffic: 'stable', gdd: 968.5,
    drivers: drivers(5.2, 6.5, 29.6, 2.0, ['moderate', 'moderate', 'moderate', 'moderate']),
    eta7: 3.0, ndvi: 0.74, deficit: 3,
  },
  {
    id: 'B5', name: 'Kloofstroom Chenin', variety: 'Chenin Blanc',
    wine_style: 'white', area_ha: 3.6, rate: 2.4, center: [18.8724, -33.9392],
    stage: 'veraison', band: [0.3, 0.5], f: 0.18, status: 'too_wet',
    score: 54, traffic: 'high', gdd: 1241.0,
    drivers: drivers(4.4, 26.5, 26.1, 11.0, ['low', 'low', 'low', 'low']),
    eta7: 3.2, ndvi: 0.84, deficit: 0,
  },
  {
    id: 'B6', name: 'Môrelig Sauvignon', variety: 'Sauvignon Blanc',
    wine_style: 'fresh_white', area_ha: 2.4, rate: 2.4, center: [18.8812, -33.9402],
    stage: 'harvest', band: [0.25, 0.4], f: 0.45, status: 'too_dry',
    score: 33, traffic: 'watch', gdd: 1472.6,
    drivers: drivers(6.1, 1.5, 33.0, 0.0, ['high', 'moderate', 'high', 'high']),
    eta7: 3.0, ndvi: 0.68, deficit: 10,
  },
  {
    id: 'B7', name: 'Leiwater Chardonnay', variety: 'Chardonnay',
    wine_style: 'white', area_ha: 1.9, rate: 2.2, center: [18.8662, -33.9468],
    stage: 'veraison', band: [0.3, 0.5], f: 0.42, status: 'on_track',
    score: 14, traffic: 'stable', gdd: 1207.3,
    drivers: drivers(5.4, 5.0, 30.2, 3.0, ['moderate', 'moderate', 'moderate', 'moderate']),
    eta7: 3.6, ndvi: 0.75, deficit: 4,
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
    const holdDays = def.id === 'B5' ? 6 : 5;
    return {
      type: 'hold',
      needed_mm: 0,
      runtime_hours: 0,
      window: 'hold',
      next_check: addDays(AS_OF, holdDays),
      hold_days: holdDays,
    };
  }
  const needed = Math.max(0, (def.f - mid(def.band)) * TAW);
  const runtime = round1(needed / def.rate);
  return {
    type: 'pour',
    needed_mm: round1(needed),
    runtime_hours: runtime,
    window: needed > 0.5 ? 'tonight' : 'optional',
    next_check: addDays(AS_OF, def.status === 'too_dry' ? 3 : 5),
    hold_days: null,
  };
}

const RECOMMENDATION: Record<string, string> = {
  B1: 'Apply 25 mm (12.6 h drip, split across two nights) to steer Bosberg Cabernet back onto its véraison glide path.',
  B2: 'Skaliekop Shiraz is 0.16 past its band in véraison — apply 31 mm (17.3 h over three nights) before berries dehydrate.',
  B3: 'Hold irrigation on Rivierkant Merlot: the soil sits 0.11 wetter than target. Watering now dilutes the red and drives canopy vigour. Recheck in 5 days.',
  B4: 'Windberg Pinotage is on its fruit-set glide path. No irrigation needed; recheck 2026-01-24.',
  B5: 'Stop watering Kloofstroom Chenin. At 0.18 depletion it is 0.12 too wet — excess water in véraison swells berries and dilutes flavour. Hold ~6 days for ETc to dry it back into band.',
  B6: 'Môrelig Sauvignon is drifting dry into harvest. A measured 15 mm (6.3 h) tonight holds fruit weight without over-diluting.',
  B7: 'Leiwater Chardonnay sits mid-band in véraison. Optional 2 mm top-up; otherwise recheck 2026-01-25.',
};

/**
 * Depletion fraction → modelled midday stem water potential equivalent (R3).
 * Linear mapping calibrated so the premium-red véraison band [0.35, 0.55]
 * lands on the literature RDI target of −1.0 to −1.2 MPa. Marked "modelled"
 * everywhere it is shown; the backend reads the real table from mswp_map.json.
 */
export const mswpOfFraction = (f: number): number => round2(-(0.65 + f));

const mswpBand = (band: TargetBand): [number, number] => [
  mswpOfFraction(band[0]),
  mswpOfFraction(band[1]),
];

function statusOf(def: BlockDef): BlockStatus {
  const deviation =
    def.status === 'too_dry'
      ? round2(def.f - def.band[1])
      : def.status === 'too_wet'
        ? round2(def.f - def.band[0])
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
  B1: 'Running dry — 0.11 past band, water tonight.',
  B2: 'Critical — 0.16 too dry in véraison; catch-up over 3 nights.',
  B3: 'Too wet — dilution risk, skip irrigation.',
  B4: 'On track in fruit set.',
  B5: 'Too wet — hold water, berries are swelling.',
  B6: 'Drifting dry into harvest — a light top-up holds fruit weight.',
  B7: 'Sitting on the véraison glide path.',
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
      'Two premium reds are off-path and too dry — B2 is critical. Two blocks are over-watered (B3, B5): hold water on the whites before dilution costs quality. Three blocks are holding their glide path.',
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

export function mockBattlePlan(req: BattlePlanRequest): BattlePlan {
  const hoursPerDay = Math.max(0.5, req.available_hours_per_day);
  const horizon = Math.max(1, Math.min(7, req.horizon_days));

  const candidates = BLOCKS.filter((d) => d.status === 'too_dry')
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
      const dev = round2(c.def.f - c.def.band[1]);
      entries.push({
        block_id: c.def.id,
        hours,
        mm_applied: round1(hours * c.def.rate),
        reason:
          idx === 0
            ? `Highest glide-path deviation (too dry, +${dev}) in ${c.def.stage}; no rain forecast.`
            : `Next priority (+${dev} deviation, ${c.def.wine_style.replace('_', ' ')}); topped up after higher-value blocks.`,
      });
      c.remainingHours -= hours;
      budget -= hours;
    }
    plan.push({ day: addDays(AS_OF, day), entries });
  }

  const skipped = BLOCKS.filter((d) => d.status !== 'too_dry').map((d) => ({
    block_id: d.id,
    reason:
      d.status === 'too_wet'
        ? 'Currently too wet — irrigation would push it further off path.'
        : d.id === 'B4'
          ? '2 mm rain forecast keeps fruit-set depletion inside the band without irrigation.'
          : 'On the glide path near band midpoint; no water needed this cycle.',
  }));

  const blocksWatered = new Set(
    plan.flatMap((day) => day.entries.map((e) => e.block_id)),
  ).size;
  const totalHours = round1(
    plan.reduce((s, d) => s + d.entries.reduce((a, e) => a + e.hours, 0), 0),
  );
  // Water saved = what a conventional "water the low readings" schedule would have
  // poured onto the blocks we deliberately skipped.
  const savedMm: Record<string, number> = { B3: 8, B5: 8, B4: 4, B7: 3 };
  const waterSaved = Math.round(
    BLOCKS.filter((d) => d.status !== 'too_dry').reduce(
      (s, d) => s + (savedMm[d.id] ?? 0) * d.area_ha * 10,
      0,
    ) / 5,
  ) * 5;

  return {
    as_of: AS_OF,
    plan,
    skipped,
    summary: `${totalHours} h over ${horizon} day${horizon > 1 ? 's' : ''} allocated to ${blocksWatered} of 7 blocks; ${skipped.length} skipped on forecast and glide path; est. ${waterSaved.toLocaleString('en-ZA')} m³ water saved.`,
  };
}

// ---------- season bank (responds to remaining_m3) ----------
export function mockSeasonBank(remainingM3 = 12000): SeasonBank {
  const projectedDemand = 15400;
  const daysToEnd = diffDays(AS_OF, SEASON_END);
  const dailyDemand = projectedDemand / daysToEnd;

  const verdict: SeasonBank['verdict'] =
    remainingM3 >= projectedDemand
      ? 'ok'
      : remainingM3 >= projectedDemand * 0.85
        ? 'tight'
        : 'shortfall';

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
  if (verdict === 'ok') {
    advice = `Comfortable: projected demand of ${projectedDemand.toLocaleString('en-ZA')} m³ leaves roughly ${(remainingM3 - projectedDemand).toLocaleString('en-ZA')} m³ of buffer through harvest.`;
  } else if (verdict === 'tight') {
    advice = `Within margin but tight. Hold the whites (B5, B7) toward their lower band edge to protect a ~1,200 m³ reserve for the final véraison push.`;
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

function scoreSimple(f: number, band: TargetBand): {
  status: Status;
  deviation: number;
  score: number;
  traffic: Traffic;
} {
  const [lo, hi] = band;
  let deviation = 0;
  let status: Status = 'on_track';
  if (f > hi) {
    deviation = f - hi;
    status = 'too_dry';
  } else if (f < lo) {
    deviation = f - lo;
    status = 'too_wet';
  }
  const score = Math.min(100, Math.round((Math.abs(deviation) / 0.35) * 100));
  const traffic: Traffic =
    score <= 25 ? 'stable' : score <= 50 ? 'watch' : score <= 75 ? 'high' : 'critical';
  return { status, deviation: round2(deviation), score, traffic };
}

const SCENARIO_REC: Record<Status, string> = {
  too_dry: 'Deficit widening — bring irrigation forward to defend the glide path.',
  too_wet: 'Dilution risk rising — hold all water and let ETc recover the band.',
  on_track: 'Holds inside the target band under this scenario.',
};

export function mockScenario(req: ScenarioRequest): ScenarioBlock[] {
  const df = SCENARIO_DF[req.type] * (req.days / 7);
  return BLOCKS.map((def) => {
    const base = scoreSimple(def.f, def.band);
    const f2 = clamp(def.f + df, 0.03, 0.97);
    const s = scoreSimple(f2, def.band);
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
      blocks_flagged: ['B1', 'B2', 'B4'],
      lead_days: 6,
      narrative:
        'Engine projected B1 and B2 breaching their bands six days before the 38 °C spike on 4 December.',
    },
    {
      date: '2026-01-08',
      type: 'heat_spike',
      blocks_flagged: ['B1', 'B2', 'B5', 'B6'],
      lead_days: 4,
      narrative:
        'Four blocks flagged four days ahead of the 36 °C event on 8 January.',
    },
    {
      date: '2026-01-13',
      type: 'wet_swing',
      blocks_flagged: ['B3', 'B5'],
      lead_days: 3,
      narrative:
        '12 mm of rain on 13 January pushed B3 and B5 below their bands; the engine had flagged over-watering risk three days prior.',
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
  settingsState.cacheEntries = defs.length * 3;
  settingsState.oldestMinutes = 0;
  return {
    ok: true,
    results: defs.map((d) => ({
      block_id: d.id,
      ok: true,
      detail: `142 archive days + 14-day forecast re-warmed in ${(0.3 + (hash(d.id) % 40) / 100).toFixed(2)} s`,
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
  const [bandLoMpa, bandHiMpa] = [mswpOfFraction(def.band[0]), mswpOfFraction(def.band[1])];
  const deltas = readings.map((r) => r.delta_mpa);
  const bias = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const rmse = Math.sqrt(deltas.reduce((s, d) => s + d * d, 0) / deltas.length);
  const within = readings.filter(
    (r) => r.mswp_mpa <= bandLoMpa && r.mswp_mpa >= bandHiMpa,
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

export function mockLogReading(req: ValidationReadingRequest): ValidationReading {
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
  return reading;
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
  B1: [
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
      note: 'Vigorous growth after the rain week.',
      analysis: {
        gli_mean: 0.24,
        canopy_cover_pct: 79,
        yellowing_pct: 2,
        stress_hint: 'none',
        agrees_with_model: true,
      },
    },
  ],
  B4: [
    {
      daysAgo: 9,
      note: null,
      analysis: {
        gli_mean: 0.21,
        canopy_cover_pct: 70,
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
