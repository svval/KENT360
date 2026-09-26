import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Analitik' };

export default function AnalyticsPage() {
  return (
    <ModulePlaceholder
      href="/analytics"
      phase="Phase 10"
      capabilities={[
        'Tarih, kategori, mahalle, müdürlük, öncelik filtreleri',
        'Kategori dağılımı ve talep trendi',
        'Müdürlük bazında açık iş yükü',
        'SLA başarı oranı',
      ]}
    />
  );
}
