/**
 * Base map style (MapLibre style JSON). Default: OpenFreeMap "positron" – free, no API
 * key, OpenStreetMap data; its attribution comes from the style and is always shown.
 * Set NEXT_PUBLIC_MAP_STYLE_URL to use another provider; an empty value disables the
 * base map and the map shows a configuration notice instead of failing.
 */
const DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export const mapConfig = {
  styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? DEFAULT_STYLE,
  /** Demo neighbourhood rectangles are not official boundaries (development builds say so). */
  showDemoBoundaryNotice: process.env.NODE_ENV !== 'production',
  /** Fallback view when the municipality has no map centre. */
  fallbackCenter: [37.3825, 37.0594] as [number, number],
  fallbackZoom: 12,
} as const;
