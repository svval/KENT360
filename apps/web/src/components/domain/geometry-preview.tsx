'use client';

import { type NeighborhoodFeatureCollection, type Position } from '@kent360/shared-types';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface GeometryPreviewProps {
  collection: NeighborhoodFeatureCollection;
  highlightId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}

const PADDING = 8;
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
  className,
}: GeometryPreviewProps) {
  const shapes = useMemo(() => {
    const points: Position[] = collection.features.flatMap((f) => f.geometry.coordinates.flat(2));
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
    const spanX = Math.max((maxLng - minLng) * kx, 1e-9);
    const spanY = Math.max(maxLat - minLat, 1e-9);
    const scale = (WIDTH - PADDING * 2) / spanX;
    const height = Math.min(Math.max(spanY * scale + PADDING * 2, 120), 480);
    const yScale = Math.min(scale, (height - PADDING * 2) / spanY);
    const project = ([lng, lat]: Position) =>
      `${(PADDING + (lng - minLng) * kx * yScale).toFixed(1)},${(height - PADDING - (lat - minLat) * yScale).toFixed(1)}`;

    return {
      height,
      items: collection.features.map((f) => ({
        id: f.properties.id,
        name: f.properties.name,
        path: f.geometry.coordinates
          .flatMap((polygon) => polygon.map((ring) => `M${ring.map(project).join('L')}Z`))
          .join(''),
      })),
    };
  }, [collection]);

  if (!shapes) return null;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${shapes.height.toFixed(0)}`}
      className={cn('h-auto w-full rounded-lg bg-subtle', className)}
      role="img"
      aria-label={`Mahalle sınırları önizlemesi: ${shapes.items.length} mahalle`}
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
    </svg>
  );
}
