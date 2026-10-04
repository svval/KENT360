import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MapView } from './map-view';

export const metadata: Metadata = { title: 'Canlı Harita' };

export default function MapPage() {
  // Filters live in the URL (useSearchParams) – needs a Suspense boundary.
  return (
    <Suspense>
      <MapView />
    </Suspense>
  );
}
