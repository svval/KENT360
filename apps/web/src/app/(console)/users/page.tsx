import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';

export const metadata: Metadata = { title: 'Kullanıcılar' };

export default function UsersPage() {
  return (
    <ModulePlaceholder
      href="/users"
      phase="Phase 3"
      capabilities={[
        'Personel ve vatandaş hesapları',
        'Müdürlük ve ekip bağlantıları',
        'Hesap durumu: aktif, askıda, devre dışı',
        'Rol atama (audit log kaydıyla)',
      ]}
    />
  );
}
