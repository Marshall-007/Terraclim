/**
 * TypeScript mirror of docs/API_CONTRACT.md (v1). These shapes are binding —
 * the typed client (services/api.ts) and the mock fixtures (services/mocks.ts)
 * both satisfy exactly these interfaces.
 */

export type WineStyle = 'premium_red' | 'red' | 'white' | 'fresh_white';

export type Stage =
  | 'dormant'
  | 'budbreak'
  | 'flowering'
  | 'fruit_set'
  | 'veraison'
  | 'harvest'
  | 'post_harvest';

export type Traffic = 'stable' | 'watch' | 'high' | 'critical';

export type Status = 'on_track' | 'too_dry' | 'too_wet';

export type Pressure = 'high' | 'moderate' | 'low';

/** [lo, hi] target depletion-fraction band. */
export type TargetBand = [number, number];

// GET /api/health
export interface Health {
  status: string;
  provider: string;
  terraclim_ready: boolean;
  as_of: string;
  cache_age_minutes: number;
}

// GET /api/blocks — GeoJSON FeatureCollection
export interface BlockProperties {
  id: string;
  name: string;
  variety: string;
  wine_style: WineStyle;
  area_ha: number;
  application_rate_mm_h: number;
  taw_mm: number;
}

export interface BlockFeature {
  type: 'Feature';
  properties: BlockProperties;
  geometry: {
    type: 'Polygon';
    // GeoJSON: array of linear rings, each an array of [lon, lat] pairs.
    coordinates: number[][][];
  };
}

export interface BlockCollection {
  type: 'FeatureCollection';
  features: BlockFeature[];
}

export interface Driver {
  key: string;
  label: string;
  value: number;
  unit: string;
  pressure: Pressure;
}

export interface PourSlip {
  type: 'pour' | 'hold';
  needed_mm: number;
  runtime_hours: number;
  window: string;
  next_check: string;
  hold_days: number | null;
}

// GET /api/blocks/{id}/status
export interface BlockStatus {
  block_id: string;
  as_of: string;
  stage: Stage;
  gdd: number;
  depletion_mm: number;
  depletion_fraction: number;
  target_band: TargetBand;
  status: Status;
  deviation: number;
  score: number;
  traffic: Traffic;
  drivers: Driver[];
  recommendation: string;
  pour_slip: PourSlip;
}

/** Status object augmented with a baseline delta — /api/scenario response. */
export interface ScenarioBlock extends BlockStatus {
  delta: number;
}

// GET /api/blocks/{id}/timeseries
export interface HistoryPoint {
  date: string;
  et0: number;
  etc: number;
  rain: number;
  irrigation_mm: number;
  depletion_fraction: number;
  band_lo: number;
  band_hi: number;
  stage: Stage;
}

export interface ForecastPoint {
  date: string;
  et0: number;
  etc: number;
  rain: number;
  depletion_fraction_projected: number;
  band_lo: number;
  band_hi: number;
}

export interface Timeseries {
  block_id: string;
  history: HistoryPoint[];
  forecast: ForecastPoint[];
}

// POST /api/battle-plan
export interface BattlePlanRequest {
  available_hours_per_day: number;
  horizon_days: number;
}

export interface PlanEntry {
  block_id: string;
  hours: number;
  mm_applied: number;
  reason: string;
}

export interface PlanDay {
  day: string;
  entries: PlanEntry[];
}

export interface SkippedBlock {
  block_id: string;
  reason: string;
}

export interface BattlePlan {
  as_of: string;
  plan: PlanDay[];
  skipped: SkippedBlock[];
  summary: string;
}

// GET /api/season-bank
export type SeasonVerdict = 'ok' | 'tight' | 'shortfall';

export interface BurnDownPoint {
  date: string;
  bank_m3: number;
  demand_to_date_m3: number;
}

export interface SeasonBank {
  as_of: string;
  remaining_m3: number;
  projected_demand_m3: number;
  verdict: SeasonVerdict;
  run_dry_date: string | null;
  days_short: number;
  burn_down: BurnDownPoint[];
  advice: string;
}

// POST /api/scenario
export type ScenarioType = 'heatwave' | 'drought' | 'rain_event' | 'cool_spell';

export interface ScenarioRequest {
  type: ScenarioType;
  days: number;
}

// GET /api/backtest
export interface BacktestEvent {
  date: string;
  type: string;
  blocks_flagged: string[];
  lead_days: number;
  narrative: string;
}

export interface BacktestSeriesPoint {
  date: string;
  farm_mean_score: number;
  blocks_out_of_band: number;
}

export interface Backtest {
  window: [string, string];
  events: BacktestEvent[];
  series: BacktestSeriesPoint[];
}

// GET /api/briefing
export interface BriefingBlock {
  block_id: string;
  name: string;
  traffic: Traffic;
  status: Status;
  score: number;
  headline: string;
}

export interface Briefing {
  blocks: BriefingBlock[];
  farm_summary: string;
}

// POST /api/irrigation
export interface IrrigationRequest {
  block_id: string;
  date: string;
  mm: number;
}

export interface IrrigationResponse {
  ok: boolean;
}
