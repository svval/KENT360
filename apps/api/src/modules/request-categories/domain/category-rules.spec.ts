import { formatSlaMinutes, RecordStatus, SLA_MAX_MINUTES } from '@kent360/shared-types';
import { buildTree, categoryRuleViolation, effectiveSlaMinutes, slaLabel } from './category-rules';

const { ACTIVE, INACTIVE } = RecordStatus;
const root = { id: 'root', parentId: null, status: ACTIVE };

describe('categoryRuleViolation', () => {
  it('accepts roots with or without department', () => {
    expect(
      categoryRuleViolation(
        { parentId: null, departmentId: null, status: ACTIVE, hasChildren: true },
        null,
      ),
    ).toBeNull();
  });

  it('accepts a routed sub-category under an active root', () => {
    expect(
      categoryRuleViolation(
        { parentId: 'root', departmentId: 'd', status: ACTIVE, hasChildren: false },
        root,
      ),
    ).toBeNull();
  });

  it('requires a department on sub-categories', () => {
    expect(
      categoryRuleViolation(
        { parentId: 'root', departmentId: null, status: ACTIVE, hasChildren: false },
        root,
      )?.code,
    ).toBe('CATEGORY_DEPARTMENT_REQUIRED');
  });

  it('keeps the tree at two levels and free of cycles', () => {
    const sub = { id: 'sub', parentId: 'root', status: ACTIVE };
    const state = { departmentId: 'd', status: ACTIVE, hasChildren: false };
    expect(categoryRuleViolation({ ...state, parentId: 'sub' }, sub)?.code).toBe(
      'CATEGORY_HIERARCHY_INVALID',
    );
    expect(categoryRuleViolation({ ...state, id: 'root', parentId: 'root' }, root)?.code).toBe(
      'CATEGORY_HIERARCHY_INVALID',
    );
    expect(
      categoryRuleViolation(
        { ...state, id: 'other-root', parentId: 'root', hasChildren: true },
        root,
      )?.code,
    ).toBe('CATEGORY_HIERARCHY_INVALID');
  });

  it('forbids an active sub-category under an inactive root', () => {
    const inactiveRoot = { ...root, status: INACTIVE };
    const state = { parentId: 'root', departmentId: 'd', hasChildren: false };
    expect(categoryRuleViolation({ ...state, status: ACTIVE }, inactiveRoot)?.code).toBe(
      'CATEGORY_PARENT_INACTIVE',
    );
    expect(categoryRuleViolation({ ...state, status: INACTIVE }, inactiveRoot)).toBeNull();
  });
});

describe('SLA', () => {
  it('inherits from the root when the sub-category has none', () => {
    expect(effectiveSlaMinutes(240, 1440)).toBe(240);
    expect(effectiveSlaMinutes(null, 1440)).toBe(1440);
    expect(effectiveSlaMinutes(null, null)).toBeNull();
  });

  it.each([
    [30, '30 dakika'],
    [60, '1 saat'],
    [90, '1 saat 30 dakika'],
    [240, '4 saat'],
    [1440, '1 gün'],
    [2160, '1 gün 12 saat'],
    [10080, '7 gün'],
    [SLA_MAX_MINUTES, '365 gün'],
  ])('formats %i minutes as "%s"', (minutes, label) => {
    expect(formatSlaMinutes(minutes)).toBe(label);
  });

  it('labels missing SLAs as null', () => {
    expect(slaLabel(null)).toBeNull();
    expect(slaLabel(240)).toBe('4 saat');
  });
});

describe('buildTree', () => {
  it('nests sub-categories under roots, ordered by sortOrder then name', () => {
    const tree = buildTree([
      { id: 'c', parentId: 'r1', sortOrder: 2, name: 'Kaldırım' },
      { id: 'r2', parentId: null, sortOrder: 2, name: 'Temizlik' },
      { id: 'r1', parentId: null, sortOrder: 1, name: 'Yol' },
      { id: 'a', parentId: 'r1', sortOrder: 1, name: 'Çukur' },
      { id: 'b', parentId: 'r1', sortOrder: 1, name: 'Asfalt' },
    ]);
    expect(tree.map((n) => n.id)).toEqual(['r1', 'r2']);
    expect(tree[0].children.map((n) => n.id)).toEqual(['b', 'a', 'c']);
    expect(tree[1].children).toEqual([]);
  });
});
