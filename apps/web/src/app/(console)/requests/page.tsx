import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RequestsView } from './requests-view';

export const metadata: Metadata = { title: 'Talepler' };

export default function RequestsPage() {
  // Filters live in the URL (useSearchParams) – needs a Suspense boundary.
  return (
    <Suspense>
      <RequestsView />
    </Suspense>
  );
}
