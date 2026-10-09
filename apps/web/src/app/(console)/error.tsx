'use client';

import { CircleAlert, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

/** Unexpected error inside a console page: the shell (menu, topbar) stays usable. */
export default function ConsoleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={CircleAlert}
        title="Bu sayfa görüntülenemedi"
        description="Beklenmeyen bir hata oluştu. Tekrar deneyin; sorun sürerse sistem yöneticinize bildirin."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={reset}>
              <RotateCcw aria-hidden="true" />
              Tekrar dene
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link href="/dashboard">Dashboard&apos;a dön</Link>
            </Button>
          </div>
        }
      />
    </Card>
  );
}
