'use client';

import {
  type MapRequestProperties,
  type MapWorkOrderProperties,
  type NeighborhoodFeatureCollection,
  type NeighborhoodRiskLevel,
} from '@kent360/shared-types';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CircleAlert, MapPinOff } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getNeighborhoodGeoJson } from '@/lib/api/municipality-domain';
import { RISK_RAMP } from '@/components/domain/pulse-parts';
import { getMapRequests, getMapWorkOrders, listNeighborhoodPulse } from '@/lib/api/operations';
import { mapConfig } from '@/lib/map-config';
import { cn } from '@/lib/utils';
import { ICON_PIXEL_RATIO, MARKER_COLORS, markerImages } from './map-icons';

export interface MapLayersState {
  requests: boolean;
  critical: boolean;
  workOrders: boolean;
  neighborhoods: boolean;
  /** Request density heatmap (Phase 10). */
  heatmap: boolean;
  /** Neighbourhood risk choropleth (MahallePulse score, Phase 10). */
  risk: boolean;
}

export interface NeighborhoodRiskInfo {
  riskScore: number;
  riskLevel: NeighborhoodRiskLevel;
  open: number;
  slaBreachPercent: number | null;
}

export interface MapFilters {
  status?: string;
  priority?: string;
  departmentId?: string;
  categoryId?: string;
  createdFrom?: string;
  createdTo?: string;
}

export type MapSelection =
  | { kind: 'request'; properties: MapRequestProperties }
  | { kind: 'workOrder'; properties: MapWorkOrderProperties }
  | { kind: 'neighborhood'; name: string; id?: string; risk?: NeighborhoodRiskInfo | null };

export interface MapStats {
  requests: number;
  critical: number;
  workOrders: number;
  truncated: boolean;
}

interface OperationsMapProps {
  layers: MapLayersState;
  filters?: MapFilters;
  /** The user may see requests (requests.read); otherwise only work orders are loaded. */
  canSeeRequests: boolean;
  /** MahallePulse scores for the choropleth (analytics.read). */
  canSeeRisk?: boolean;
  /** Only open requests / work orders (dashboard). */
  openOnly?: boolean;
  center?: [number, number] | null;
  zoom?: number | null;
  onSelect?: (selection: MapSelection | null) => void;
  onStats?: (stats: MapStats) => void;
  className?: string;
}

const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const LAYER_IDS: Record<keyof MapLayersState, string[]> = {
  requests: ['requests-clusters', 'requests-cluster-count', 'requests-points'],
  critical: ['critical-points'],
  workOrders: ['work-orders-points'],
  neighborhoods: ['neighborhoods-fill', 'neighborhoods-line'],
  heatmap: ['requests-heat'],
  risk: ['neighborhoods-risk'],
};

type Status = 'loading' | 'ready' | 'no-style' | 'unsupported' | 'style-error';

/**
 * The operations map (Phase 9) – shared by /map and the dashboard. MapLibre GL with a
 * free base map; data comes from the scoped GeoJSON endpoints for the visible area
 * (bbox, debounced on pan/zoom), requests are clustered. Selections are reported to
 * the parent, which renders the detail card (no HTML strings in popups).
 */
export function OperationsMap({
  layers,
  filters = {},
  canSeeRequests,
  canSeeRisk = false,
  openOnly = false,
  center,
  zoom,
  onSelect,
  onStats,
  className,
}: OperationsMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [status, setStatus] = useState<Status>(mapConfig.styleUrl ? 'loading' : 'no-style');
  const [loadError, setLoadError] = useState<string | null>(null);
  // Latest props for map event handlers registered once.
  const latest = useRef({
    filters,
    canSeeRequests,
    canSeeRisk,
    openOnly,
    onSelect,
    onStats,
    layers,
  });
  // Updated after each render (handlers run later, never during render).
  useLayoutEffect(() => {
    latest.current = { filters, canSeeRequests, canSeeRisk, openOnly, onSelect, onStats, layers };
  });
  const reloadRef = useRef<() => void>(() => undefined);
  const riskRef = useRef(new Map<string, NeighborhoodRiskInfo>());

  // ─── Create the map once ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapConfig.styleUrl || !container.current) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let timer: number | undefined;
    let abort: AbortController | null = null;

    void import('maplibre-gl').then((maplibre) => {
      if (cancelled || !container.current) return;
      // The worker is served from public/ (scripts/copy-maplibre-worker.mjs): MapLibre's own
      // bundle-relative worker URL does not survive Next.js chunking.
      maplibre.setWorkerUrl(`/maplibre/${maplibre.getVersion()}/maplibre-gl-worker.mjs`);
      try {
        map = new maplibre.Map({
          container: container.current,
          style: mapConfig.styleUrl,
          center: center ?? mapConfig.fallbackCenter,
          zoom: zoom ?? mapConfig.fallbackZoom,
          attributionControl: { compact: true, customAttribution: 'OpenFreeMap' },
          dragRotate: false,
          pitchWithRotate: false,
        });
      } catch {
        setStatus('unsupported');
        return;
      }
      mapRef.current = map;
      // Development/test builds expose the instance on the container for browser smoke tests.
      if (process.env.NODE_ENV !== 'production') {
        (container.current as HTMLDivElement & { maplibre?: MapLibreMap }).maplibre = map;
      }
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'bottom-right');
      map.on('error', () => {
        if (!map?.loaded()) setStatus((s) => (s === 'loading' ? 'style-error' : s));
      });

      const load = async () => {
        if (!map) return;
        abort?.abort();
        abort = new AbortController();
        const signal = abort.signal;
        const b = map.getBounds();
        const { filters: f, canSeeRequests: canRequests, openOnly: open } = latest.current;
        const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
          .map((n) => n.toFixed(5))
          .join(',');
        try {
          const [requests, workOrders] = await Promise.all([
            canRequests
              ? getMapRequests(
                  {
                    bbox,
                    open,
                    status: f.status,
                    priority: f.priority,
                    departmentId: f.departmentId,
                    categoryId: f.categoryId,
                    createdFrom: f.createdFrom,
                    createdTo: f.createdTo,
                  },
                  signal,
                )
              : null,
            getMapWorkOrders(
              { bbox, open, departmentId: f.departmentId, priority: f.priority },
              signal,
            ),
          ]);
          if (signal.aborted || !map) return;
          const all = requests?.features ?? [];
          const critical = all.filter((x) => x.properties.critical);
          (map.getSource('requests') as GeoJSONSource | undefined)?.setData({
            type: 'FeatureCollection',
            features: all.filter((x) => !x.properties.critical),
          });
          (map.getSource('critical') as GeoJSONSource | undefined)?.setData({
            type: 'FeatureCollection',
            features: critical,
          });
          (map.getSource('work-orders') as GeoJSONSource | undefined)?.setData(workOrders);
          (map.getSource('heat') as GeoJSONSource | undefined)?.setData({
            type: 'FeatureCollection',
            features: all,
          });
          setLoadError(null);
          latest.current.onStats?.({
            requests: all.length - critical.length,
            critical: critical.length,
            workOrders: workOrders.features.length,
            truncated: Boolean(requests?.truncated || workOrders.truncated),
          });
        } catch {
          if (!signal.aborted) setLoadError('Harita verisi yüklenemedi. Tekrar denenecek.');
        }
      };
      const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void load(), 300);
      };
      reloadRef.current = schedule;

      map.on('load', async () => {
        if (!map) return;
        for (const [name, image] of Object.entries(markerImages())) {
          if (!map.hasImage(name)) map.addImage(name, image, { pixelRatio: ICON_PIXEL_RATIO });
        }
        map.addSource('neighborhoods', { type: 'geojson', data: EMPTY, promoteId: 'id' });
        map.addSource('requests', {
          type: 'geojson',
          data: EMPTY,
          cluster: true,
          clusterRadius: 48,
          clusterMaxZoom: 14,
        });
        map.addSource('critical', { type: 'geojson', data: EMPTY });
        map.addSource('work-orders', { type: 'geojson', data: EMPTY });
        map.addSource('heat', { type: 'geojson', data: EMPTY });

        map.addLayer({
          id: 'neighborhoods-fill',
          type: 'fill',
          source: 'neighborhoods',
          paint: {
            'fill-color': MARKER_COLORS.request,
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.16, 0.06],
          },
        });
        // Choropleth: MahallePulse risk 0–100 on a sequential ramp (feature-state "risk").
        map.addLayer({
          id: 'neighborhoods-risk',
          type: 'fill',
          source: 'neighborhoods',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'risk'], 0],
              ...RISK_RAMP.flat(),
            ],
            'fill-opacity': [
              'case',
              ['==', ['feature-state', 'risk'], null],
              0,
              ['boolean', ['feature-state', 'hover'], false],
              0.62,
              0.45,
            ],
          },
        });
        map.addLayer({
          id: 'neighborhoods-line',
          type: 'line',
          source: 'neighborhoods',
          paint: { 'line-color': MARKER_COLORS.request, 'line-width': 1.2, 'line-opacity': 0.7 },
        });
        // Density of requests (all statuses in the current filters) – one hue, light → dark.
        map.addLayer({
          id: 'requests-heat',
          type: 'heatmap',
          source: 'heat',
          maxzoom: 17,
          paint: {
            'heatmap-weight': ['case', ['get', 'critical'], 1, 0.6],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.4],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 14, 15, 32],
            'heatmap-opacity': 0.75,
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(37,99,235,0)',
              0.2,
              '#BFDBFE',
              0.45,
              '#60A5FA',
              0.7,
              '#2563EB',
              1,
              '#1E3A8A',
            ],
          },
        });
        map.addLayer({
          id: 'requests-clusters',
          type: 'circle',
          source: 'requests',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': MARKER_COLORS.cluster,
            'circle-opacity': 0.88,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
          },
        });
        map.addLayer({
          id: 'requests-cluster-count',
          type: 'symbol',
          source: 'requests',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 12,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        });
        map.addLayer({
          id: 'requests-points',
          type: 'symbol',
          source: 'requests',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': ['case', ['get', 'done'], 'k-done', 'k-request'],
            'icon-allow-overlap': true,
          },
        });
        map.addLayer({
          id: 'work-orders-points',
          type: 'symbol',
          source: 'work-orders',
          // Offset so a work order and its source request (same point) are both visible.
          layout: {
            'icon-image': 'k-work-order',
            'icon-allow-overlap': true,
            'icon-offset': [9, -9],
          },
        });
        map.addLayer({
          id: 'critical-points',
          type: 'symbol',
          source: 'critical',
          layout: { 'icon-image': 'k-critical', 'icon-allow-overlap': true },
        });
        applyVisibility(map, latest.current.layers);

        // Interaction ------------------------------------------------------
        const pointer = (layer: string) => {
          map!.on('mouseenter', layer, () => (map!.getCanvas().style.cursor = 'pointer'));
          map!.on('mouseleave', layer, () => (map!.getCanvas().style.cursor = ''));
        };
        ['requests-clusters', 'requests-points', 'critical-points', 'work-orders-points'].forEach(
          pointer,
        );
        map.on('click', 'requests-clusters', async (e: MapLayerMouseEvent) => {
          const feature = e.features?.[0];
          if (!feature || !map) return;
          const source = map.getSource('requests') as GeoJSONSource;
          const target = await source.getClusterExpansionZoom(
            feature.properties.cluster_id as number,
          );
          map.easeTo({
            center: (feature.geometry as unknown as { coordinates: [number, number] }).coordinates,
            zoom: target,
          });
        });
        let hovered: string | number | undefined;
        map.on('mousemove', 'neighborhoods-fill', (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.id;
          if (hovered !== undefined && hovered !== id)
            map!.setFeatureState({ source: 'neighborhoods', id: hovered }, { hover: false });
          if (id !== undefined)
            map!.setFeatureState({ source: 'neighborhoods', id }, { hover: true });
          hovered = id;
        });
        map.on('mouseleave', 'neighborhoods-fill', () => {
          if (hovered !== undefined)
            map!.setFeatureState({ source: 'neighborhoods', id: hovered }, { hover: false });
          hovered = undefined;
        });
        map.on('click', (e) => {
          const hits = map!.queryRenderedFeatures(e.point, {
            layers: [
              'requests-clusters',
              'requests-points',
              'critical-points',
              'work-orders-points',
            ].filter((id) => map!.getLayoutProperty(id, 'visibility') !== 'none'),
          });
          // The topmost marker wins (a work order sits next to its source request).
          const top = hits[0];
          if (top?.layer.id === 'requests-clusters') return; // zoom handled above
          if (top) {
            latest.current.onSelect?.(
              top.layer.id === 'work-orders-points'
                ? { kind: 'workOrder', properties: top.properties as never }
                : { kind: 'request', properties: top.properties as never },
            );
            return;
          }
          const areaLayers = ['neighborhoods-fill', 'neighborhoods-risk'].filter(
            (id) => map!.getLayoutProperty(id, 'visibility') !== 'none',
          );
          const area =
            areaLayers.length > 0
              ? map!.queryRenderedFeatures(e.point, { layers: areaLayers }).find(Boolean)
              : undefined;
          latest.current.onSelect?.(
            area
              ? {
                  kind: 'neighborhood',
                  id: String(area.id ?? area.properties.id),
                  name: String(area.properties.name),
                  risk: riskRef.current.get(String(area.id ?? area.properties.id)) ?? null,
                }
              : null,
          );
        });

        setStatus('ready');
        map.on('moveend', schedule);
        void load();
        try {
          const areas: NeighborhoodFeatureCollection = await getNeighborhoodGeoJson();
          (map.getSource('neighborhoods') as GeoJSONSource | undefined)?.setData(areas as never);
          if (latest.current.canSeeRisk) {
            const pulse = await listNeighborhoodPulse();
            for (const n of pulse) {
              riskRef.current.set(n.id, {
                riskScore: n.riskScore,
                riskLevel: n.riskLevel,
                open: n.open,
                slaBreachPercent: n.slaBreachPercent,
              });
              map.setFeatureState({ source: 'neighborhoods', id: n.id }, { risk: n.riskScore });
            }
          }
        } catch {
          // Boundaries are context only; markers still work without them.
        }
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      abort?.abort();
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Layer toggles ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (map && status === 'ready') applyVisibility(map, layers);
  }, [layers, status]);

  // ─── Filters → reload ──────────────────────────────────────────────────
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    if (status === 'ready') reloadRef.current();
  }, [filterKey, status]);

  return (
    <div className={cn('relative overflow-hidden bg-[#eef2f6]', className)}>
      {/* Not "absolute inset-0": maplibre-gl.css sets .maplibregl-map { position: relative }. */}
      <div ref={container} className="h-full w-full" data-testid="operations-map" />
      {status === 'loading' && (
        <div className="absolute inset-0 p-4" role="status" aria-label="Harita yükleniyor">
          <Skeleton className="h-full w-full" />
        </div>
      )}
      {(status === 'no-style' || status === 'unsupported' || status === 'style-error') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <MapPinOff className="size-8 text-muted" aria-hidden="true" />
          <p className="text-sm font-semibold">
            {status === 'no-style'
              ? 'Harita altlığı yapılandırılmamış'
              : status === 'unsupported'
                ? 'Tarayıcınız harita gösterimini desteklemiyor'
                : 'Harita altlığı yüklenemedi'}
          </p>
          <p className="max-w-sm text-[13px] text-muted">
            {status === 'no-style'
              ? 'NEXT_PUBLIC_MAP_STYLE_URL ile bir MapLibre stil adresi tanımlayın.'
              : status === 'unsupported'
                ? 'WebGL desteği olan güncel bir tarayıcı kullanın.'
                : 'Altlık servisine ulaşılamıyor. İnternet bağlantınızı kontrol edip sayfayı yenileyin.'}
          </p>
        </div>
      )}
      {loadError && status === 'ready' && (
        <p
          role="alert"
          className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-xs text-critical shadow-[var(--shadow-popover)]"
        >
          <CircleAlert className="size-4" aria-hidden="true" />
          {loadError}
        </p>
      )}
    </div>
  );
}

function applyVisibility(map: MapLibreMap, layers: MapLayersState) {
  for (const [key, ids] of Object.entries(LAYER_IDS) as [keyof MapLayersState, string[]][]) {
    for (const id of ids) {
      if (map.getLayer(id))
        map.setLayoutProperty(id, 'visibility', layers[key] ? 'visible' : 'none');
    }
  }
}
