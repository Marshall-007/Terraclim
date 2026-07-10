import { useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import type { BlockFeature, Status, Traffic } from '../../types/api';
import { collectionBounds, ringToLatLng } from '../../lib/geo';
import { blockFill } from '../../lib/status';
import { color } from '../../theme/tokens';

export interface MapBlockState {
  traffic: Traffic;
  status: Status;
}

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
}: {
  features: BlockFeature[];
  states: Record<string, MapBlockState>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
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
            eventHandlers={{ click: () => onSelect?.(id) }}
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

export function BlockMap({
  features,
  states,
  selectedId,
  onSelect,
  className = '',
}: {
  features: BlockFeature[];
  states: Record<string, MapBlockState>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const bounds = collectionBounds(features);
  return (
    <div className={`overflow-hidden rounded-lg border border-line ${className}`}>
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [28, 28] }}
        scrollWheelZoom
        className="h-full w-full"
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
          maxZoom={19}
        />
        <HatchDefs />
        <BlockPolygons
          features={features}
          states={states}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </MapContainer>
    </div>
  );
}
