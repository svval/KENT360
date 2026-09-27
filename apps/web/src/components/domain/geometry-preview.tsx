'use client';

import { type NeighborhoodFeatureCollection, type Position } from '@kent360/shared-types';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface GeometryPreviewProps {
  collection: NeighborhoodFeatureCollection;
  highlightId?: string | null;
  onSelect?: (id: string) => void;
  /** A point (e.g. a request location) drawn on top; the view grows to include it. */
  marker?: { latitude: number; longitude: number } | null;
  className?: string;
}

const PADDING = 12;
const WIDTH = 400;

/**
 * Schematic SVG preview of neighbourhood boundaries – no base map, no dependency.
 * Equirectangular projection with a cos(latitude) correction keeps shapes proportional
 * at municipal scale. The interactive map (MapLibre) arrives with Phase 9 GIS.
 */
export function GeometryPreview({
  collection,
  highlightId,
  onSelect,
  marker,
  className,
}: GeometryPreviewProps) {
  const shapes = useMemo(() => {
    const points: Position[] = collection.features.flatMap((f) => f.geometry.coordinates.flat(2));
    if (marker) points.push([marker.longitude, marker.latitude]);
    if (points.length === 0) return null;
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const [minLng, maxLng, minLat, maxLat] = [
      Math.min(...lngs),
      Math.max(...lngs),
      Math.min(...lats),
      Math.max(...lats),
    ];
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = Math.max((maxLng - minLng) * kx, 1e-4);
    const spanY = Math.max(maxLat - minLat, 1e-4);
    const scale = (WIDTH - PADDING * 2) / spanX;
    const height = Math.min(Math.max(spanY * scale + PADDING * 2, 120), 480);
    const yScale = Math.min(scale, (height - PADDING * 2) / spanY);
    const x = (lng: number) => PADDING + (lng - minLng) * kx * yScale;
    const y = (lat: number) => height - PADDING - (lat - minLat) * yScale;
    const project = ([lng, lat]: Position) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`;

    return {
      height,
      marker: marker ? { cx: x(marker.longitude), cy: y(marker.latitude) } : null,
      items: collection.features.map((f) => ({
        id: f.properties.id,
        name: f.properties.name,
        path: f.geometry.coordinates
          .flatMap((polygon) => polygon.map((ring) => `M${ring.map(project).join('L')}Z`))
          .join(''),
      })),
    };
  }, [collection, marker]);

  if (!shapes) return null;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${shapes.height.toFixed(0)}`}
      className={cn('h-auto w-full rounded-lg bg-subtle', className)}
      role="img"
      aria-label={
        marker
          ? `Konum önizlemesi: seçilen nokta ve ${shapes.items.length} mahalle sınırı`
          : `Mahalle sınırları önizlemesi: ${shapes.items.length} mahalle`
      }
    >
      {shapes.items.map((item) => {
        const active = item.id === highlightId;
        return (
          <path
            key={item.id}
            d={item.path}
            fillRule="evenodd"
            onClick={onSelect ? () => onSelect(item.id) : undefined}
            className={cn(
              'stroke-[1.5] transition-colors',
              active ? 'fill-primary/35 stroke-primary' : 'fill-primary/10 stroke-primary/60',
              onSelect && 'cursor-pointer hover:fill-primary/25',
            )}
          >
            <title>{item.name}</title>
          </path>
        );
      })}
      {shapes.marker && (
        <g aria-hidden="true">
          <circle cx={shapes.marker.cx} cy={shapes.marker.cy} r={9} className="fill-critical/20" />
          <circle
            cx={shapes.marker.cx}
            cy={shapes.marker.cy}
            r={4.5}
            className="fill-critical stroke-white stroke-2"
          />
        </g>
      )}
    </svg>
  );
}
