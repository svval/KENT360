import { formatSlaMinutes, RecordStatus } from '@kent360/shared-types';

/**
 * Request category model (docs/DATABASE_DESIGN.md §9):
 *   • exactly two levels – root categories group, sub-categories are what citizens pick;
 *   • a sub-category must route to a department (Phase 5 assigns requests with it);
 *     a root may carry a department too, used when a root without sub-categories is
 *     picked directly;
 *   • a sub-category cannot be ACTIVE under an INACTIVE root;
 *   • SLA minutes are inherited from the root when the sub-category has none.
 */

export interface CategoryState {
  id?: string;
  parentId: string | null;
  departmentId: string | null;
  status: RecordStatus;
  hasChildren: boolean;
}

export interface ParentState {
  id: string;
  parentId: string | null;
  status: RecordStatus;
}

export type RuleViolation =
  | { code: 'CATEGORY_HIERARCHY_INVALID'; message: string }
  | { code: 'CATEGORY_DEPARTMENT_REQUIRED'; message: string }
  | { code: 'CATEGORY_PARENT_INACTIVE'; message: string };

/** `parent` is the resolved (same-tenant) parent, or null for a root category. */
export function categoryRuleViolation(
  next: CategoryState,
  parent: ParentState | null,
): RuleViolation | null {
  if (parent) {
    if (next.id !== undefined && parent.id === next.id) {
      return {
        code: 'CATEGORY_HIERARCHY_INVALID',
        message: 'Kategori kendisinin üst kategorisi olamaz.',
      };
    }
    if (parent.parentId !== null) {
      return {
        code: 'CATEGORY_HIERARCHY_INVALID',
        message: 'Kategori ağacı iki seviyelidir: üst kategori bir ana kategori olmalı.',
      };
    }
    if (next.hasChildren) {
      return {
        code: 'CATEGORY_HIERARCHY_INVALID',
        message: 'Alt kategorileri olan bir kategori başka bir kategorinin altına taşınamaz.',
      };
    }
    if (!next.departmentId) {
      return {
        code: 'CATEGORY_DEPARTMENT_REQUIRED',
        message: 'Alt kategoriler bir müdürlüğe yönlendirilmelidir.',
      };
    }
    if (next.status === RecordStatus.ACTIVE && parent.status === RecordStatus.INACTIVE) {
      return {
        code: 'CATEGORY_PARENT_INACTIVE',
        message: 'Pasif bir ana kategorinin altında aktif alt kategori olamaz.',
      };
    }
  }
  return null;
}

/** Own SLA, else the root's. null = no SLA configured (Phase 5 then skips slaDueAt). */
export function effectiveSlaMinutes(own: number | null, parentOwn: number | null): number | null {
  return own ?? parentOwn ?? null;
}

export function slaLabel(minutes: number | null): string | null {
  return minutes === null ? null : formatSlaMinutes(minutes);
}

export interface TreeItem {
  id: string;
  parentId: string | null;
  sortOrder: number;
  name: string;
}

/** Nests a flat list (roots first by sortOrder, then name – Turkish collation). */
export function buildTree<T extends TreeItem>(items: T[]): (T & { children: T[] })[] {
  const compare = (a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'tr');
  const children = new Map<string, T[]>();
  for (const item of items) {
    if (item.parentId) children.set(item.parentId, [...(children.get(item.parentId) ?? []), item]);
  }
  return items
    .filter((item) => item.parentId === null)
    .sort(compare)
    .map((root) => ({ ...root, children: (children.get(root.id) ?? []).sort(compare) }));
}
