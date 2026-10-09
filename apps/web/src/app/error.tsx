'use client';

import { CircleAlert, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

/** Unexpected rendering error outside the console shell – never a stack trace. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <StatusPage
      icon={CircleAlert}
      title="Beklenmeyen bir hata oluştu"
      description="Sayfa yüklenirken bir sorun oluştu. Tekrar deneyin; sorun sürerse sistem yöneticinize bildirin."
      actions={
        <>
          <Button onClick={reset}>
            <RotateCcw aria-hidden="true" />
            Tekrar dene
          </Button>
          <Button asChild variant="secondary">
            <Link href="/dashboard">Dashboard&apos;a dön</Link>
          </Button>
        </>
      }
    />
  );
}
