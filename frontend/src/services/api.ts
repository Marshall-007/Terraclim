/**
 * Typed Vino API client. Every method mirrors an endpoint in
 * docs/API_CONTRACT.md. If the backend is unreachable (or slow), the call
 * transparently falls back to bundled demo fixtures so the app always renders,
 * and a global "demo data" flag flips on for the UI badge.
 */

import type {
  Backtest,
  BattlePlan,
  BattlePlanRequest,
  BlockCollection,
  BlockFeature,
  BlockPhoto,
  BlockStatus,
  BlockValidation,
  Briefing,
  CacheRefreshResponse,
  CreateBlockRequest,
  DeleteBlockResponse,
  DemoDateRequest,
  DemoDateResponse,
  Health,
  IrrigationRequest,
  IrrigationResponse,
  ProviderRequest,
  ProviderResponse,
  ScenarioBlock,
  ScenarioRequest,
  SeasonBank,
  Settings,
  Timeseries,
  ValidationReading,
  ValidationReadingRequest,
} from '../types/api';
import * as mock from './mocks';

const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
);
const TIMEOUT_MS = 4000;

// ---------- demo-mode signal (tiny observable) ----------
type Listener = (demo: boolean) => void;
let demoMode = false;
let resolved = false;
const listeners = new Set<Listener>();

function setDemo(next: boolean) {
  resolved = true;
  if (next === demoMode) return;
  demoMode = next;
  for (const l of listeners) l(demoMode);
}

export const apiMode = {
  isDemo: () => demoMode,
  isResolved: () => resolved,
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// ---------- settings-changed signal ----------
// Bumped after any mutation that can alter the active data source or as_of
// (provider switch, cache refresh, demo date) so the header badge and open
// screens can refetch without a page reload.
type VersionListener = () => void;
let settingsVersion = 0;
const settingsListeners = new Set<VersionListener>();

function bumpSettings() {
  settingsVersion++;
  for (const l of settingsListeners) l();
}

export const settingsSignal = {
  version: () => settingsVersion,
  subscribe(fn: VersionListener): () => void {
    settingsListeners.add(fn);
    return () => settingsListeners.delete(fn);
  },
};

// ---------- fetch helper ----------
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function served<T>(live: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    const data = await live();
    setDemo(false);
    return data;
  } catch {
    setDemo(true);
    return fallback();
  }
}

// ---------- endpoints ----------
export const api = {
  getHealth: () =>
    served<Health>(() => fetchJson('/api/health'), () => mock.mockHealth()),

  getBlocks: () =>
    served<BlockCollection>(() => fetchJson('/api/blocks'), () => mock.mockBlocks()),

  getBlockStatus: (id: string) =>
    served<BlockStatus>(
      () => fetchJson(`/api/blocks/${id}/status`),
      () => mock.mockStatus(id),
    ),

  getTimeseries: (id: string, days = 45) =>
    served<Timeseries>(
      () => fetchJson(`/api/blocks/${id}/timeseries?days=${days}`),
      () => mock.mockTimeseries(id, days),
    ),

  getBriefing: () =>
    served<Briefing>(() => fetchJson('/api/briefing'), () => mock.mockBriefing()),

  postBattlePlan: (req: BattlePlanRequest) =>
    served<BattlePlan>(
      () => fetchJson('/api/battle-plan', { method: 'POST', body: JSON.stringify(req) }),
      () => mock.mockBattlePlan(req),
    ),

  getSeasonBank: (remainingM3: number) =>
    served<SeasonBank>(
      () => fetchJson(`/api/season-bank?remaining_m3=${remainingM3}`),
      () => mock.mockSeasonBank(remainingM3),
    ),

  postScenario: (req: ScenarioRequest) =>
    served<ScenarioBlock[]>(
      () => fetchJson('/api/scenario', { method: 'POST', body: JSON.stringify(req) }),
      () => mock.mockScenario(req),
    ),

  getBacktest: (months = 4) =>
    served<Backtest>(
      () => fetchJson(`/api/backtest?months=${months}`),
      () => mock.mockBacktest(),
    ),

  postIrrigation: (req: IrrigationRequest) =>
    served<IrrigationResponse>(
      () =>
        fetchJson('/api/irrigation', { method: 'POST', body: JSON.stringify(req) }),
      () => ({ ok: true }),
    ),
};

/** Probe the backend once at startup so the demo badge resolves promptly. */
export async function initApiMode(): Promise<void> {
  await api.getHealth();
}

export type ApiClient = typeof api;
