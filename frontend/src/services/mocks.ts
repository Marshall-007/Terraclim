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

const BLOCKS: BlockDef[] = [
  {
    id: 'B1', name: 'Bosberg Cabernet', variety: 'Cabernet Sauvignon',
    wine_style: 'premium_red', area_ha: 2.8, rate: 2.0, center: [18.8605, -33.9305],
    stage: 'veraison', band: [0.35, 0.55], f: 0.66, status: 'too_dry',
    score: 64, traffic: 'high', gdd: 1455.2,
    drivers: drivers(6.4, 0.8, 34.2, 0.0, ['high', 'high', 'high', 'high']),
  },
  {
    id: 'B2', name: 'Skaliekop Shiraz', variety: 'Shiraz',
    wine_style: 'premium_red', area_ha: 3.2, rate: 1.8, center: [18.8712, -33.9302],
    stage: 'veraison', band: [0.35, 0.55], f: 0.71, status: 'too_dry',
    score: 82, traffic: 'critical', gdd: 1362.8,
    drivers: drivers(6.6, 0.4, 35.1, 0.0, ['high', 'high', 'high', 'high']),
  },
  {
    id: 'B3', name: 'Rivierkant Merlot', variety: 'Merlot',
    wine_style: 'red', area_ha: 2.1, rate: 2.2, center: [18.8808, -33.9312],
    stage: 'veraison', band: [0.35, 0.55], f: 0.24, status: 'too_wet',
    score: 46, traffic: 'watch', gdd: 1288.4,
    drivers: drivers(4.6, 22.0, 26.8, 8.0, ['low', 'low', 'low', 'low']),
  },
  {
    id: 'B4', name: 'Windberg Pinotage', variety: 'Pinotage',
    wine_style: 'red', area_ha: 1.8, rate: 2.0, center: [18.8618, -33.9382],
    stage: 'fruit_set', band: [0.4, 0.6], f: 0.5, status: 'on_track',
    score: 9, traffic: 'stable', gdd: 968.5,
    drivers: drivers(5.2, 6.5, 29.6, 2.0, ['moderate', 'moderate', 'moderate', 'moderate']),
  },
  {
    id: 'B5', name: 'Kloofstroom Chenin', variety: 'Chenin Blanc',
    wine_style: 'white', area_ha: 3.6, rate: 2.4, center: [18.8724, -33.9392],
    stage: 'veraison', band: [0.3, 0.5], f: 0.18, status: 'too_wet',
    score: 54, traffic: 'high', gdd: 1241.0,
    drivers: drivers(4.4, 26.5, 26.1, 11.0, ['low', 'low', 'low', 'low']),
  },
  {
    id: 'B6', name: 'Môrelig Sauvignon', variety: 'Sauvignon Blanc',
    wine_style: 'fresh_white', area_ha: 2.4, rate: 2.4, center: [18.8812, -33.9402],
    stage: 'harvest', band: [0.25, 0.4], f: 0.45, status: 'too_dry',
    score: 33, traffic: 'watch', gdd: 1472.6,
    drivers: drivers(6.1, 1.5, 33.0, 0.0, ['high', 'moderate', 'high', 'high']),
  },
  {
    id: 'B7', name: 'Leiwater Chardonnay', variety: 'Chardonnay',
    wine_style: 'white', area_ha: 1.9, rate: 2.2, center: [18.8662, -33.9468],
    stage: 'veraison', band: [0.3, 0.5], f: 0.42, status: 'on_track',
    score: 14, traffic: 'stable', gdd: 1207.3,
    drivers: drivers(5.4, 5.0, 30.2, 3.0, ['moderate', 'moderate', 'moderate', 'moderate']),
  },
];

const byId = (id: string): BlockDef => {
  const b = BLOCKS.find((x) => x.id === id);
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

export const mockBlocks: BlockCollection = {
  type: 'FeatureCollection',
  features: BLOCKS.map<BlockFeature>((def) => ({
    type: 'Feature',
    properties: {
      id: def.id,
      name: def.name,
      variety: def.variety,
      wine_style: def.wine_style,
      area_ha: def.area_ha,
      application_rate_mm_h: def.rate,
      taw_mm: TAW,
    } satisfies BlockProperties,
    geometry: { type: 'Polygon', coordinates: makePoly(def) },
  })),
};

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
    drivers: def.drivers,
    recommendation: RECOMMENDATION[def.id],
    pour_slip: pourSlip(def),
  };
}

export const mockStatuses: Record<string, BlockStatus> = Object.fromEntries(
  BLOCKS.map((d) => [d.id, statusOf(d)]),
);

export const mockStatus = (id: string): BlockStatus => mockStatuses[id];

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

  const history = frac.map((fVal, i) => {
    const date = addDays(AS_OF, -(n - 1) + i);
    const et0 = i === 0 ? round1(baseEt0) : et0s[i - 1];
    return {
      date,
      et0,
      etc: round1(et0 * kc),
      rain: i === 0 ? 0 : rains[i - 1],
      irrigation_mm: i === 0 ? 0 : irrs[i - 1],
      depletion_fraction: round2(fVal),
      band_lo: lo,
      band_hi: hi,
      stage: def.stage,
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

export const mockBriefing: Briefing = {
  blocks: [...BLOCKS]
    .sort((a, b) => b.score - a.score)
    .map((d) => ({
      block_id: d.id,
      name: d.name,
      traffic: d.traffic,
      status: d.status,
      score: d.score,
      headline: HEADLINE[d.id],
    })),
  farm_summary:
    'Two premium reds are off-path and too dry — B2 is critical. Two blocks are over-watered (B3, B5): hold water on the whites before dilution costs quality. Three blocks are holding their glide path.',
};

export const mockHealth: Health = {
  status: 'ok',
  provider: 'open-meteo',
  terraclim_ready: false,
  as_of: AS_OF,
  cache_age_minutes: 37,
};

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

  return { window: [start, end], events, series };
}
