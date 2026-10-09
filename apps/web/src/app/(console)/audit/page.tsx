import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuditView } from './audit-view';

export const metadata: Metadata = { title: 'Audit' };

export default function AuditPage() {
  return (
    <Suspense>
      <AuditView />
    </Suspense>
  );
}
