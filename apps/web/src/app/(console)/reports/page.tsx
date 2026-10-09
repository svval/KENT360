import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReportsView } from './reports-view';

export const metadata: Metadata = { title: 'Raporlar' };

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsView />
    </Suspense>
  );
}
