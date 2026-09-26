import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NeighborhoodsView } from './neighborhoods-view';

export const metadata: Metadata = { title: 'Mahalle Sınırları' };

export default function NeighborhoodsSettingsPage() {
  return (
    <Suspense>
      <NeighborhoodsView />
    </Suspense>
  );
}
