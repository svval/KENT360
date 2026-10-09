import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NotificationsView } from './notifications-view';

export const metadata: Metadata = { title: 'Bildirimler' };

export default function NotificationsPage() {
  return (
    <Suspense>
      <NotificationsView />
    </Suspense>
  );
}
