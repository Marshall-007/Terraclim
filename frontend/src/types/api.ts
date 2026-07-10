/**
 * TypeScript mirror of docs/API_CONTRACT.md (v1 + the Contract v2 addendum).
 * These shapes are binding — the typed client (services/api.ts) and the mock
 * fixtures (services/mocks.ts) both satisfy exactly these interfaces.
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
export interface BlockTerrain {
  elevation_m: number;
  slope_deg: number;
  aspect: string;
  jan_et0_normal_mm_day: number;
  annual_rain_normal_mm: number;
}

export interface BlockProperties {
  id: string;
  name: string;
  variety: string;
  wine_style: WineStyle;
  area_ha: number;
  application_rate_mm_h: number;
  taw_mm: number;
  /** True for blocks traced in-app (POST /api/blocks); only these are deletable. */
  user_created?: boolean;
  /** TerraClim terrain + long-term normals — present once the data pack loads. */
  terrain?: BlockTerrain;
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
  /** Modelled midday stem water potential equivalent (MPa, negative). v2 §B. */
  mswp_estimate_mpa?: number;
  /** MPa at [band lo, band hi] — the target expressed in grower units. */
  mswp_band_mpa?: [number, number];
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
  /** Measured actual ET (mm) when an ETa source exists. v2 §A. */
  eta?: number;
  /** Sentinel-2 vigour when available. v2 §A. */
  ndvi?: number;
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
  /** v2 §G — day-D flags use only data ≤ D; the UI states this. */
  methodology?: 'information_limited' | string;
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

// ---------------------------------------------------------------------------
// Contract v2 addendum
// ---------------------------------------------------------------------------

// POST /api/blocks (v2 §F — traced block polygons)
export interface CreateBlockRequest {
  name: string;
  variety: string;
  wine_style: WineStyle;
  application_rate_mm_h: number;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

export interface DeleteBlockResponse {
  ok: boolean;
  error?: string;
}

// GET /api/settings (v2 §D)
export type ProviderName = 'open-meteo' | 'terraclim' | 'datapack';

export interface Settings {
  provider: ProviderName | string;
  terraclim_ready: boolean;
  /** "unset" | "set (••••1234)" — the token value is never returned. */
  token_status: string;
  cache: { entries: number; oldest_minutes: number };
  as_of: string;
  datapack: { loaded: boolean; path?: string; layers?: string[] };
}

// POST /api/settings/provider
export interface ProviderRequest {
  provider: ProviderName | string;
  token?: string;
}

export interface ProviderResponse {
  ok: boolean;
  error?: string;
  settings?: Settings;
}

// POST /api/settings/cache/refresh
export interface CacheRefreshBlockResult {
  block_id: string;
  ok: boolean;
  detail: string;
}

export interface CacheRefreshResponse {
  ok: boolean;
  results: CacheRefreshBlockResult[];
}

// POST /api/settings/demo-date
export interface DemoDateRequest {
  as_of: string;
}

export interface DemoDateResponse {
  ok: boolean;
  as_of: string;
}

// GET /api/validation/{block_id} (v2 §C)
export interface ValidationSeriesPoint {
  date: string;
  /** Modelled or reference MSWP-equivalent, MPa (negative). */
  mpa: number;
}

export interface ValidationReading {
  reading_id: string;
  block_id: string;
  date: string;
  mswp_mpa: number;
  note: string | null;
  /** Model value on the reading's date, and reading − model. */
  model_mpa: number;
  delta_mpa: number;
}

export interface ValidationAgreement {
  bias: number;
  rmse: number;
  n: number;
  within_band_pct: number;
}

export interface BlockValidation {
  block_id: string;
  model_series: ValidationSeriesPoint[];
  readings: ValidationReading[];
  reference_series: ValidationSeriesPoint[];
  /** e.g. "wapor", "fruitlook" — or "pending_datapack" when reference_series is []. */
  reference_source: string;
  agreement: ValidationAgreement;
}

// POST /api/validation/reading
export interface ValidationReadingRequest {
  block_id: string;
  date: string;
  mswp_mpa: number;
  note?: string;
}

// Photos (v2 §C / R17)
export type StressHint = 'none' | 'mild' | 'visible';

export interface PhotoAnalysis {
  gli_mean: number;
  canopy_cover_pct: number;
  yellowing_pct: number;
  stress_hint: StressHint;
  agrees_with_model: boolean;
}

export interface BlockPhoto {
  photo_id: string;
  block_id: string;
  date: string;
  url: string;
  note: string | null;
  analysis: PhotoAnalysis;
}
