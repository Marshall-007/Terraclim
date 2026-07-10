import { useEffect, useMemo, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { BlockFeature, Status, Traffic, WineStyle } from '../../types/api';
import {
  closeRing,
  collectionBounds,
  ringAreaHa,
  ringToLatLng,
  type LngLat,
} from '../../lib/geo';
import { api } from '../../services/api';
import { blockFill, styleLabel } from '../../lib/status';
import { color } from '../../theme/tokens';
import { Icon } from '../layout/icons';
import { Spinner } from '../common/states';

export interface MapBlockState {
  traffic: Traffic;
  status: Status;
}

type Basemap = 'satellite' | 'streets';

const BASEMAPS: Record<Basemap, { url: string; attribution: string }> = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  },
};

/**
 * Injects an SVG hatch pattern into Leaflet's overlay pane once, so too-wet
 * blocks can be filled with a cool blue diagonal hatch — the "you're
 * over-watering" signal, legible even against the traffic-light greens/reds.
 */
function HatchDefs() {
  const map = useMap();
  useEffect(() => {
    let tries = 0;
    let raf = 0;
    const inject = () => {
      const svg = map
        .getPanes()
        .overlayPane?.querySelector<SVGSVGElement>('svg');
      if (!svg) {
        if (tries++ < 30) raf = requestAnimationFrame(inject);
        return;
      }
      if (svg.querySelector('#wet-hatch')) return;
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = `
        <pattern id="wet-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="${color.wet}" fill-opacity="0.34" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="${color.wet}" stroke-width="2.4" />
        </pattern>`;
      svg.insertBefore(defs, svg.firstChild);
    };
    inject();
    return () => cancelAnimationFrame(raf);
  }, [map]);
  return null;
}

function BlockPolygons({
  features,
  states,
  selectedId,
  onSelect,
  tracing,
}: {
  features: BlockFeature[];
  states: Record<string, MapBlockState>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  tracing: boolean;
}) {
  return (
    <>
      {features.map((f) => {
        const id = f.properties.id;
        const st = states[id];
        const positions = ringToLatLng(f.geometry.coordinates[0]);
        const isWet = st?.status === 'too_wet';
        const { fill, stroke } = st
          ? blockFill(st.traffic, st.status)
          : { fill: color.slateSoft, stroke: color.slate };
        const selected = selectedId === id;
        return (
          <Polygon
            key={id}
            positions={positions}
            eventHandlers={{
              click: () => {
                if (!tracing) onSelect?.(id);
              },
            }}
            pathOptions={{
              color: isWet ? color.wet : stroke,
              weight: selected ? 3.5 : isWet ? 2.5 : 1.5,
              opacity: 1,
              dashArray: isWet ? '5 3' : undefined,
              fillColor: isWet ? 'url(#wet-hatch)' : fill,
              fillOpacity: isWet ? 1 : selected ? 0.78 : 0.62,
            }}
          >
            <Tooltip direction="center" permanent className="vino-map-label">
              {id}
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}

/**
 * Trace-a-block draw tool, written directly against Leaflet click events —
 * no draw-plugin dependency. Clicks append vertices; the preview shows the
 * clicked path, a dashed closing edge and the running area.
 */
function TraceClicks({
  active,
  onAdd,
}: {
  active: boolean;
  onAdd: (v: LngLat) => void;
}) {
  useMapEvents({
    click(e) {
      if (active) onAdd([e.latlng.lng, e.latlng.lat]);
    },
  });
  return null;
}

function TracePreview({ vertices }: { vertices: LngLat[] }) {
  const latlngs = vertices.map(([lon, lat]) => [lat, lon] as [number, number]);
  return (
    <>
      {vertices.length >= 3 && (
        <Polygon
          positions={latlngs}
          interactive={false}
          pathOptions={{
            color: color.bordeaux,
            weight: 1.5,
            dashArray: '4 4',
            fillColor: color.bordeaux,
            fillOpacity: 0.14,
          }}
        />
      )}
      {vertices.length >= 2 && (
        <Polyline
          positions={latlngs}
          interactive={false}
          pathOptions={{ color: color.bordeaux, weight: 2 }}
        />
      )}
      {vertices.map((v, i) => (
        <CircleMarker
          key={`${v[0]}-${v[1]}-${i}`}
          center={[v[1], v[0]]}
          radius={4.5}
          interactive={false}
          pathOptions={{
            color: '#ffffff',
            weight: 1.5,
            fillColor: i === 0 ? color.bordeauxDark : color.bordeaux,
            fillOpacity: 1,
          }}
        />
      ))}
    </>
  );
}

interface TraceMeta {
  name: string;
  variety: string;
  wine_style: WineStyle;
  application_rate_mm_h: number;
}

const VARIETIES = [
  'Cabernet Sauvignon',
  'Shiraz',
  'Merlot',
  'Pinotage',
  'Chenin Blanc',
  'Sauvignon Blanc',
  'Chardonnay',
];

const STYLES: WineStyle[] = ['premium_red', 'red', 'white', 'fresh_white'];

function TraceForm({
  areaHa,
  vertexCount,
  onCancel,
  onSaved,
}: {
  areaHa: number;
  vertexCount: number;
  onCancel: () => void;
  onSaved: (meta: TraceMeta) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [variety, setVariety] = useState(VARIETIES[0]);
  const [style, setStyle] = useState<WineStyle>('premium_red');
  const [rate, setRate] = useState('2.0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const rateNum = Number(rate);
    if (!name.trim()) {
      setError('Give the block a name.');
      return;
    }
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setError('Application rate must be a positive number.');
      return;
    }
    setSaving(true);
    try {
      await onSaved({
        name: name.trim(),
        variety,
        wine_style: style,
        application_rate_mm_h: rateNum,
      });
    } catch {
      setError('Could not save the block — try again.');
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-ink/25 p-4">
      <form
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-raised"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="eyebrow">New traced block</div>
        <p className="nums mt-1 text-xs text-ink-muted">
          {vertexCount} vertices · {areaHa.toFixed(2)} ha from the traced outline
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-ink-soft">
            Block name
            <input
              className="field mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Suidoos Cabernet"
              autoFocus
            />
          </label>
          <label className="block text-xs font-medium text-ink-soft">
            Variety
            <select
              className="field mt-1"
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
            >
              {VARIETIES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-ink-soft">
              Wine style
              <select
                className="field mt-1"
                value={style}
                onChange={(e) => setStyle(e.target.value as WineStyle)}
              >
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {styleLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-ink-soft">
              Rate (mm/h)
              <input
                className="field mt-1"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-critical">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="btn-ghost flex-1"
            onClick={onCancel}
            disabled={saving}
          >
            Back to tracing
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? <Spinner className="border-paper/40 border-t-paper" /> : 'Save block'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function BlockMap({
  features,
  states,
  selectedId,
  onSelect,
  onBlocksChanged,
  allowTrace = false,
  className = '',
}: {
  features: BlockFeature[];
  states: Record<string, MapBlockState>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Called after a traced block is saved so callers can refetch. */
  onBlocksChanged?: () => void;
  allowTrace?: boolean;
  className?: string;
}) {
  const bounds = useMemo(() => collectionBounds(features), [features]);
  const [basemap, setBasemap] = useState<Basemap>('satellite');
  const [tracing, setTracing] = useState(false);
  const [vertices, setVertices] = useState<LngLat[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const tiles = BASEMAPS[basemap];
  const ring = closeRing(vertices);

  const resetTrace = () => {
    setTracing(false);
    setVertices([]);
    setFormOpen(false);
  };

  useEffect(() => {
    if (!tracing || formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetTrace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tracing, formOpen]);

  const save = async (meta: TraceMeta) => {
    if (!ring) return;
    await api.postBlock({
      ...meta,
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
    resetTrace();
    onBlocksChanged?.();
  };

  return (
    // isolate contains Leaflet's high pane z-indexes so app overlays
    // (detail panel, mobile More sheet) always stack above the map.
    <div
      className={`relative isolate z-0 overflow-hidden rounded-lg border border-line ${
        tracing && !formOpen ? 'vino-tracing' : ''
      } ${className}`}
    >
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [28, 28] }}
        scrollWheelZoom
        className="h-full w-full"
        attributionControl
        maxZoom={19}
      >
        <TileLayer key={basemap} url={tiles.url} attribution={tiles.attribution} maxZoom={19} />
        <HatchDefs />
        <BlockPolygons
          features={features}
          states={states}
          selectedId={selectedId}
          onSelect={onSelect}
          tracing={tracing}
        />
        <TraceClicks
          active={tracing && !formOpen}
          onAdd={(v) => setVertices((prev) => [...prev, v])}
        />
        {tracing && <TracePreview vertices={vertices} />}
      </MapContainer>

      {/* Map controls — rendered above Leaflet's panes */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
        <div className="flex overflow-hidden rounded-md border border-line bg-surface shadow-card">
          {(['satellite', 'streets'] as Basemap[]).map((b) => (
            <button
              key={b}
              onClick={() => setBasemap(b)}
              className={`px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                basemap === b
                  ? 'bg-slate text-paper'
                  : 'bg-surface text-ink-soft hover:bg-slate-tint'
              }`}
            >
              {b === 'satellite' ? 'Satellite' : 'Streets'}
            </button>
          ))}
        </div>

        {allowTrace && !tracing && (
          <button
            onClick={() => setTracing(true)}
            className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft shadow-card transition-colors hover:bg-slate-tint"
          >
            <Icon name="polygon" size={14} /> Trace block
          </button>
        )}

        {tracing && (
          <div className="flex flex-col items-end gap-2">
            <div className="rounded-md border border-line bg-surface/95 px-2.5 py-1.5 text-[11px] text-ink-soft shadow-card backdrop-blur">
              Click the field corners on the imagery
              {ring && (
                <span className="nums ml-1 font-semibold text-ink">
                  · {ringAreaHa(ring).toFixed(2)} ha
                </span>
              )}
            </div>
            <div className="flex overflow-hidden rounded-md border border-line bg-surface shadow-card">
              <button
                onClick={() => setVertices((prev) => prev.slice(0, -1))}
                disabled={vertices.length === 0}
                className="px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft hover:bg-slate-tint disabled:opacity-40"
              >
                Undo
              </button>
              <button
                onClick={resetTrace}
                className="border-l border-line px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft hover:bg-slate-tint"
              >
                Cancel
              </button>
              <button
                onClick={() => setFormOpen(true)}
                disabled={!ring}
                className="border-l border-line bg-bordeaux px-2.5 py-1.5 text-[11px] font-semibold text-paper hover:bg-bordeaux-dark disabled:opacity-40"
              >
                Finish
              </button>
            </div>
          </div>
        )}
      </div>

      {formOpen && ring && (
        <TraceForm
          areaHa={ringAreaHa(ring)}
          vertexCount={vertices.length}
          onCancel={() => setFormOpen(false)}
          onSaved={save}
        />
      )}
    </div>
  );
}
