import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TeamsView } from './teams-view';

export const metadata: Metadata = { title: 'Saha Ekipleri' };

export default function FieldTeamsPage() {
  // Filters live in the URL (useSearchParams) – needs a Suspense boundary.
  return (
    <Suspense>
      <TeamsView />
    </Suspense>
  );
}
