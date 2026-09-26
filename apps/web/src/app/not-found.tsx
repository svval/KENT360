import { Compass } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={Compass}
        title="Sayfa bulunamadı"
        description="Aradığınız sayfa taşınmış veya hiç var olmamış olabilir."
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard">Dashboard&apos;a dön</Link>
          </Button>
        }
      />
    </main>
  );
}
