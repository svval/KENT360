import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DepartmentsView } from './departments-view';

export const metadata: Metadata = { title: 'Müdürlükler' };

export default function DepartmentsPage() {
  // Filters are read from the URL (useSearchParams) – needs a Suspense boundary.
  return (
    <Suspense>
      <DepartmentsView />
    </Suspense>
  );
}
