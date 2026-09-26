import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Canlı Harita' };

export default function MapPage() {
  return (
    <ModulePlaceholder
      href="/map"
      phase="Phase 9"
      capabilities={[
        'Talep ve iş emri katmanları, marker kümeleme',
        'Yoğunluk (heatmap) görünümü',
        'Mahalle sınırları ve choropleth görünümü',
        'Katman paneli: talepler, iş emirleri, kritik olaylar',
      ]}
    />
  );
}
