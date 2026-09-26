import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Audit Log' };

export default function AuditPage() {
  return (
    <ModulePlaceholder
      href="/audit"
      phase="Phase 13"
      capabilities={[
        'Kullanıcı, işlem ve kayıt türüne göre filtreleme',
        'Değişiklik öncesi / sonrası veri karşılaştırması',
        'IP ve istemci bilgisi',
        'Değiştirilemez (append-only) kayıt',
      ]}
    />
  );
}
