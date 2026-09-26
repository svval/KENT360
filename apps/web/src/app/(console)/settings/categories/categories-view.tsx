'use client';

import {
  Permission,
  RecordStatus,
  type RequestCategoryNode,
  formatSlaMinutes,
} from '@kent360/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Folder,
  FolderTree,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Tag,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorMessage, QueryError } from '@/components/domain/query-states';
import { PriorityBadge, RecordStatusBadge } from '@/components/domain/status-badges';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlState } from '@/hooks/use-url-state';
import { getCategoryTree, queryKeys, updateCategory } from '@/lib/api/municipality-domain';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { CategoryDialog, type CategoryDialogState } from './category-dialog';

export function CategoriesView() {
  const item = getNavItem('/settings/categories');
  const { hasPermission } = useAuth();
  const canManage = hasPermission(Permission.CATEGORIES_MANAGE);
  const [url, setUrl] = useUrlState(['id'] as const);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<CategoryDialogState | null>(null);

  const query = useQuery({ queryKey: queryKeys.categoryTree, queryFn: getCategoryTree });
  const tree = useMemo(() => query.data ?? [], [query.data]);

  const byId = useMemo(() => {
    const map = new Map<string, RequestCategoryNode>();
    for (const root of tree) {
      map.set(root.id, root);
      for (const child of root.children) map.set(child.id, child);
    }
    return map;
  }, [tree]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR');
    if (!term) return tree;
    const matches = (n: RequestCategoryNode) =>
      n.name.toLocaleLowerCase('tr-TR').includes(term) || n.code.toLowerCase().includes(term);
    return tree
      .map((root) => ({ ...root, children: root.children.filter(matches) }))
      .filter((root) => matches(root) || root.children.length > 0);
  }, [tree, search]);

  const selected = (url.id && byId.get(url.id)) || tree[0] || null;
  const parent = selected?.parentId ? (byId.get(selected.parentId) ?? null) : null;
  const subCount = tree.reduce((sum, root) => sum + root.children.length, 0);

  const header = (
    <PageHeader
      title={item.label}
      description={item.description}
      actions={
        canManage && (
          <Button onClick={() => setDialog({ mode: 'create', parent: null })}>
            <Plus aria-hidden="true" />
            Yeni Ana Kategori
          </Button>
        )
      }
    />
  );

  if (query.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <div
          className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]"
          role="status"
          aria-label="Yükleniyor"
        >
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="space-y-6">
        {header}
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {tree.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderTree}
            title="Henüz talep kategorisi yok"
            description="Vatandaşların seçeceği kategorileri ana kategori → alt kategori olarak tanımlayın."
            action={
              canManage && (
                <Button size="sm" onClick={() => setDialog({ mode: 'create', parent: null })}>
                  <Plus aria-hidden="true" />
                  Yeni Ana Kategori
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <label htmlFor="category-search" className="sr-only">
                Kategori ara
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <Input
                  id="category-search"
                  type="search"
                  className="pl-9"
                  placeholder="Kategori adı veya kodu…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                {tree.length} ana kategori · {subCount} alt kategori
              </p>
            </div>
            <nav aria-label="Kategori ağacı" className="max-h-[640px] overflow-y-auto p-2">
              {visible.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-muted">
                  Aramaya uyan kategori yok.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {visible.map((root) => {
                    const open = search.trim() !== '' || !collapsed.has(root.id);
                    return (
                      <li key={root.id}>
                        <div className="flex items-center">
                          <button
                            type="button"
                            className="rounded p-1 text-muted hover:bg-subtle disabled:invisible"
                            disabled={root.children.length === 0}
                            aria-expanded={open}
                            aria-label={open ? `${root.name} daralt` : `${root.name} genişlet`}
                            onClick={() =>
                              setCollapsed((current) => {
                                const next = new Set(current);
                                if (next.has(root.id)) next.delete(root.id);
                                else next.add(root.id);
                                return next;
                              })
                            }
                          >
                            {open ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                          <TreeButton
                            node={root}
                            selected={selected?.id === root.id}
                            onSelect={() => setUrl({ id: root.id })}
                            icon={Folder}
                          />
                        </div>
                        {open && root.children.length > 0 && (
                          <ul className="mt-0.5 ml-[18px] space-y-0.5 border-l border-border pl-2">
                            {root.children.map((child) => (
                              <li key={child.id}>
                                <TreeButton
                                  node={child}
                                  selected={selected?.id === child.id}
                                  onSelect={() => setUrl({ id: child.id })}
                                  icon={Tag}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>
          </Card>

          {selected && (
            <CategoryDetail
              category={selected}
              parent={parent}
              canManage={canManage}
              onEdit={() => setDialog({ mode: 'edit', category: selected, parent })}
              onAddChild={() => setDialog({ mode: 'create', parent: selected })}
            />
          )}
        </div>
      )}

      {dialog && (
        <CategoryDialog
          state={dialog}
          roots={tree}
          onClose={() => setDialog(null)}
          onSaved={(id) => setUrl({ id })}
        />
      )}
    </div>
  );
}

function TreeButton({
  node,
  selected,
  onSelect,
  icon: Icon,
}: {
  node: RequestCategoryNode;
  selected: boolean;
  onSelect: () => void;
  icon: typeof Folder;
}) {
  const inactive = node.status === RecordStatus.INACTIVE;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors',
        selected ? 'bg-primary-soft font-medium text-primary' : 'hover:bg-subtle',
        inactive && !selected && 'text-muted',
      )}
    >
      <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
      <span className={cn('truncate', inactive && 'line-through decoration-muted/60')}>
        {node.name}
      </span>
      {node.parentId === null && node.childCount > 0 && (
        <span className="tabular ml-auto text-xs text-muted">{node.childCount}</span>
      )}
      {inactive && <span className="sr-only">(pasif)</span>}
    </button>
  );
}

function CategoryDetail({
  category,
  parent,
  canManage,
  onEdit,
  onAddChild,
}: {
  category: RequestCategoryNode;
  parent: RequestCategoryNode | null;
  canManage: boolean;
  onEdit: () => void;
  onAddChild: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isRoot = category.parentId === null;
  const inheritedSla = category.defaultSlaMinutes === null && category.effectiveSlaMinutes !== null;
  const routedToInactive = category.department?.status === RecordStatus.INACTIVE;

  const toggle = useMutation({
    mutationFn: () =>
      updateCategory(category.id, {
        status:
          category.status === RecordStatus.ACTIVE ? RecordStatus.INACTIVE : RecordStatus.ACTIVE,
      }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['request-categories'] });
      const cascade = isRoot && saved.status === RecordStatus.INACTIVE && category.childCount > 0;
      toast.success(
        saved.status === RecordStatus.ACTIVE
          ? `${saved.name} aktifleştirildi.`
          : `${saved.name} pasifleştirildi.`,
        cascade ? 'Alt kategorileri de pasifleştirildi.' : undefined,
      );
    },
    onError: (error) => toast.error(`${category.name} güncellenemedi.`, errorMessage(error, '')),
  });

  return (
    <Card>
      <CardHeader className="flex-col gap-3 sm:flex-row">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {isRoot ? 'Ana kategori' : `${parent?.name ?? ''} › Alt kategori`}
          </p>
          <CardTitle className="mt-0.5 text-lg">{category.name}</CardTitle>
          <p className="mt-1 font-mono text-xs text-muted">{category.code}</p>
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {isRoot && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onAddChild}
                disabled={category.status === RecordStatus.INACTIVE}
              >
                <Plus aria-hidden="true" />
                Alt kategori
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil aria-hidden="true" />
              Düzenle
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toggle.mutate()}
              disabled={toggle.isPending}
            >
              {category.status === RecordStatus.ACTIVE ? (
                <PowerOff aria-hidden="true" />
              ) : (
                <Power aria-hidden="true" />
              )}
              {category.status === RecordStatus.ACTIVE ? 'Pasifleştir' : 'Aktifleştir'}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {routedToInactive && (
          <p
            className="flex gap-2 rounded-lg bg-warning-soft p-3 text-[13px] text-warning-strong"
            role="note"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Bu kategori pasif bir müdürlüğe yönlendiriliyor. Yeni talepler için aktif bir müdürlük
            seçin.
          </p>
        )}
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Detail label="Durum">
            <RecordStatusBadge status={category.status} />
          </Detail>
          <Detail label="Varsayılan öncelik">
            <PriorityBadge priority={category.defaultPriority} />
          </Detail>
          <Detail label="Yönlendirilen müdürlük">
            {category.department ? (
              <span>
                {category.department.name}{' '}
                <span className="font-mono text-xs text-muted">({category.department.code})</span>
              </span>
            ) : (
              <span className="text-muted">{isRoot ? 'Tanımsız (ana kategori)' : 'Tanımsız'}</span>
            )}
          </Detail>
          <Detail label="SLA (çözüm süresi)">
            {category.effectiveSlaMinutes !== null ? (
              <span>
                <span className="font-medium">
                  {formatSlaMinutes(category.effectiveSlaMinutes)}
                </span>{' '}
                <span className="tabular text-xs text-muted">
                  ({category.effectiveSlaMinutes} dk)
                </span>
                {inheritedSla && (
                  <Badge tone="neutral" className="ml-2">
                    Ana kategoriden
                  </Badge>
                )}
              </span>
            ) : (
              <span className="text-muted">Tanımsız</span>
            )}
          </Detail>
          {isRoot && (
            <Detail label="Alt kategori sayısı">
              <span className="tabular">{category.childCount}</span>
            </Detail>
          )}
          <Detail label="Sıra">
            <span className="tabular">{category.sortOrder}</span>
          </Detail>
          <Detail label="Açıklama" wide>
            {category.description ?? <span className="text-muted">—</span>}
          </Detail>
          <Detail label="Anahtar kelimeler (otomatik sınıflandırma)" wide>
            {category.keywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {category.keywords.map((k) => (
                  <Badge key={k} tone="neutral">
                    {k}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted">—</span>
            )}
          </Detail>
        </dl>
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(wide && 'sm:col-span-2')}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-[13.5px]">{children}</dd>
    </div>
  );
}
