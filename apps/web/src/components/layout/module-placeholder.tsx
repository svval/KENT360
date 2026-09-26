import { CircleDashed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getNavItem } from './navigation';
import { PageHeader } from './page-header';

interface ModulePlaceholderProps {
  href: string;
  phase: string;
  capabilities: string[];
}

/**
 * Honest placeholder for routes whose module is scheduled for a later phase:
 * states what the page will do and when, instead of showing fake data.
 */
export function ModulePlaceholder({ href, phase, capabilities }: ModulePlaceholderProps) {
  const item = getNavItem(href);
  const Icon = item.icon;

  return (
    <div className="space-y-6">
      <PageHeader title={item.label} description={item.description} />
      <Card className="p-6 lg:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Bu modül geliştirme planında</h2>
              <Badge tone="info">{phase}</Badge>
            </div>
            <p className="mt-1 text-muted">Modül tamamlandığında bu ekranda şunlar yer alacak:</p>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {capabilities.map((capability) => (
                <li key={capability} className="flex items-start gap-2.5">
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span>{capability}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
