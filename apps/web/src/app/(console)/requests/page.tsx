import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Talepler' };

export default function RequestsPage() {
  return (
    <ModulePlaceholder
      href="/requests"
      phase="Phase 5 · Phase 8"
      capabilities={[
        'Filtrelenebilir, sıralanabilir talep tablosu (URL state)',
        'Durum, öncelik, müdürlük, mahalle ve tarih filtreleri',
        'SLA durumu: zamanında, riskte, aşıldı',
        'Talep detayı, zaman çizelgesi ve AI analizi',
      ]}
    />
  );
}
