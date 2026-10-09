import { Compass } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Sayfa bulunamadı' };

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      icon={Compass}
      title="Sayfa bulunamadı"
      description="Aradığınız sayfa taşınmış, kaldırılmış veya hiç var olmamış olabilir."
      actions={
        <Button asChild>
          <Link href="/dashboard">Dashboard&apos;a dön</Link>
        </Button>
      }
    />
  );
}
