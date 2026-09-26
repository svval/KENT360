import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Ayarlar' };

export default function SettingsPage() {
  return (
    <ModulePlaceholder
      href="/settings"
      phase="Phase 4"
      capabilities={[
        'Belediye profili, logo ve marka renkleri',
        'Müdürlük ve mahalle yönetimi',
        'Hiyerarşik talep kategorileri',
        'Kategori bazlı SLA süreleri',
      ]}
    />
  );
}
