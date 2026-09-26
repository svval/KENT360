import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Saha Operasyonları' };

export default function FieldPage() {
  return (
    <ModulePlaceholder
      href="/field"
      phase="Phase 6"
      capabilities={[
        'Saha ekipleri, sorumlular ve üyeler',
        'Personel bazında günlük iş yükü',
        'Ekip performansı ve ortalama çözüm süresi',
        'Saha360 mobil uygulaması ile senkron görevler',
      ]}
    />
  );
}
