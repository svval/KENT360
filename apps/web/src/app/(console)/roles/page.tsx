import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Roller ve Yetkiler' };

export default function RolesPage() {
  return (
    <ModulePlaceholder
      href="/roles"
      phase="Phase 3"
      capabilities={[
        'Sistem rolleri: vatandaş, saha personeli, ekip sorumlusu, müdür, yönetici',
        'Rol bazında yetki matrisi',
        'Belediyeye özel rol tanımlama',
        'Yetki değişikliklerinin denetim kaydı',
      ]}
    />
  );
}
