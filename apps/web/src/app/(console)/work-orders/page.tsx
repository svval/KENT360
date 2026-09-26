import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'İş Emirleri' };

export default function WorkOrdersPage() {
  return (
    <ModulePlaceholder
      href="/work-orders"
      phase="Phase 6 · Phase 8"
      capabilities={[
        'İş emri oluşturma ve ekip/personel ataması',
        'Atama geçmişi ve iş akışı durumları',
        'Önce / sonra fotoğraf karşılaştırması',
        'Tamamlanan işin yönetici doğrulaması',
      ]}
    />
  );
}
