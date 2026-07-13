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
  Glossary,
  Health,
  Insight,
  InsightRequest,
  IrrigationRequest,
  IrrigationResponse,
  ProviderRequest,
  ProviderResponse,
  ScenarioBlock,
  ScenarioRequest,
  SeasonBank,
  Settings,
  Timeseries,
  ValidationReadingRequest,
  ValidationReadingResponse,
} from '../types/api';
import * as mock from './mocks';

const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
);
// Generous enough for the slowest live endpoint (concurrent scenario compute
// runs ~6 s under a dev-mode double fetch); the mock fallback still guarantees
// the UI never hangs past this.
const TIMEOUT_MS = 10_000;

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
// Identical in-flight requests share one promise (StrictMode double-mounts and
// simultaneous screens would otherwise duplicate expensive POST computes).
const inflight = new Map<string, Promise<unknown>>();

function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const body = typeof init?.body === 'string' ? init.body : '';
  const key = `${init?.method ?? 'GET'} ${path} ${body}`;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const request = (async () => {
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
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  return request;
}

/**
 * Runs `live()`; on any failure (network error, timeout, non-2xx) it swallows
 * the error, flips the app into demo mode, and resolves with `fallback()`
 * instead. Every endpoint below is built on this so the whole app degrades to
 * mock data instead of showing broken screens when the backend is down.
 */
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

  // ----- v2: traced blocks -----
  postBlock: (req: CreateBlockRequest) =>
    served<BlockFeature>(
      () => fetchJson('/api/blocks', { method: 'POST', body: JSON.stringify(req) }),
      () => mock.mockCreateBlock(req),
    ),

  deleteBlock: (id: string) =>
    served<DeleteBlockResponse>(
      () => fetchJson(`/api/blocks/${id}`, { method: 'DELETE' }),
      () => mock.mockDeleteBlock(id),
    ),

  // ----- v2: settings / data source -----
  getSettings: () =>
    served<Settings>(() => fetchJson('/api/settings'), () => mock.mockSettings()),

  postProvider: async (req: ProviderRequest): Promise<ProviderResponse> => {
    const res = await served<ProviderResponse>(
      () =>
        fetchJson('/api/settings/provider', {
          method: 'POST',
          body: JSON.stringify(req),
        }),
      () => mock.mockSetProvider(req),
    );
    if (res.ok) bumpSettings();
    return res;
  },

  postCacheRefresh: async (): Promise<CacheRefreshResponse> => {
    const res = await served<CacheRefreshResponse>(
      () => fetchJson('/api/settings/cache/refresh', { method: 'POST' }),
      () => mock.mockCacheRefresh(),
    );
    bumpSettings();
    return res;
  },

  postDemoDate: async (req: DemoDateRequest): Promise<DemoDateResponse> => {
    const res = await served<DemoDateResponse>(
      () =>
        fetchJson('/api/settings/demo-date', {
          method: 'POST',
          body: JSON.stringify(req),
        }),
      () => mock.mockDemoDate(req),
    );
    bumpSettings();
    return res;
  },

  // ----- v2: validation -----
  getValidation: (blockId: string) =>
    served<BlockValidation>(
      () => fetchJson(`/api/validation/${blockId}`),
      () => mock.mockValidation(blockId),
    ),

  postValidationReading: (req: ValidationReadingRequest) =>
    served<ValidationReadingResponse>(
      () =>
        fetchJson('/api/validation/reading', {
          method: 'POST',
          body: JSON.stringify(req),
        }),
      () => mock.mockLogReading(req),
    ),

  // ----- v2: photos -----
  getPhotos: (blockId: string) =>
    served<BlockPhoto[]>(
      () => fetchJson(`/api/photos/${blockId}`),
      () => mock.mockPhotos(blockId),
    ),

  // ----- v2: AI insights (§H) -----
  postInsight: (req: InsightRequest) =>
    served<Insight>(
      () => fetchJson('/api/insight', { method: 'POST', body: JSON.stringify(req) }),
      () => mock.mockInsight(req),
    ),

  getGlossary: () =>
    served<Glossary>(
      () => fetchJson('/api/insight/glossary'),
      () => mock.mockGlossary(),
    ),
};

/**
 * Multipart photo upload with real progress (XMLHttpRequest, since fetch
 * cannot observe upload progress). Falls back to the mock analysis pipeline
 * when the backend is unreachable, replaying staged progress so the UI
 * behaves the same in demo mode.
 */
export function uploadPhoto(
  blockId: string,
  file: File,
  note: string,
  onProgress: (fraction: number) => void,
): Promise<BlockPhoto> {
  const live = new Promise<BlockPhoto>((resolve, reject) => {
    const form = new FormData();
    form.append('block_id', blockId);
    form.append('image', file);
    if (note.trim()) form.append('note', note.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/photos`);
    xhr.timeout = 15_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as BlockPhoto);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Bad photo response'));
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(form);
  });

  return live
    .then((photo) => {
      setDemo(false);
      return photo;
    })
    .catch(async () => {
      setDemo(true);
      // Staged mock progress so the demo shows the same upload experience.
      for (const p of [0.3, 0.65, 1]) {
        await new Promise((r) => setTimeout(r, 160));
        onProgress(p);
      }
      const objectUrl = URL.createObjectURL(file);
      return mock.mockAnalysePhoto(
        blockId,
        { name: file.name, size: file.size },
        note.trim() || null,
        objectUrl,
      );
    });
}

/** Probe the backend once at startup so the demo badge resolves promptly. */
export async function initApiMode(): Promise<void> {
  await api.getHealth();
}

export type ApiClient = typeof api;
