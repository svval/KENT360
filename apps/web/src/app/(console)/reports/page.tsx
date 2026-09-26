import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Raporlar' };

export default function ReportsPage() {
  return (
    <ModulePlaceholder
      href="/reports"
      phase="Phase 13"
      capabilities={[
        'Aylık talep raporu',
        'SLA performans raporu',
        'Mahalle ve müdürlük raporları',
        'CSV dışa aktarım (ardından PDF)',
      ]}
    />
  );
}
