import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Mahalleler' };

export default function NeighborhoodsPage() {
  return (
    <ModulePlaceholder
      href="/neighborhoods"
      phase="Phase 10"
      capabilities={[
        'Mahalle bazında toplam, açık ve kritik talepler',
        'Ortalama çözüm süresi ve SLA başarısı',
        'En sık görülen sorun kategorileri',
        '7 / 30 / 90 günlük eğilimler ve anomali uyarıları',
      ]}
    />
  );
}
