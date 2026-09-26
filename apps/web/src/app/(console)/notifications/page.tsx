import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Bildirimler' };

export default function NotificationsPage() {
  return (
    <ModulePlaceholder
      href="/notifications"
      phase="Phase 13"
      capabilities={[
        'Yeni talep ve kritik talep bildirimleri',
        'İş emri atama bildirimleri',
        'SLA riski ve aşım uyarıları',
        'Okundu / okunmadı yönetimi',
      ]}
    />
  );
}
