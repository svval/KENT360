import { Permission, WorkOrderStatus } from '@kent360/shared-types';
import {
  ASSIGNABLE_STATUSES,
  availableWorkOrderTransitions,
  checkWorkOrderTransition,
  WORK_ORDER_TRANSITIONS,
  workOrderStatusDescription,
} from './work-order-status.machine';

const S = WorkOrderStatus;
const P = Permission;

const fieldStaff = {
  permissions: new Set([
    P.WORK_ORDERS_READ_ASSIGNED,
    P.WORK_ORDERS_EXECUTE,
    P.WORK_ORDERS_COMPLETE,
  ]),
  isExecutor: true,
};
const colleague = { ...fieldStaff, isExecutor: false };
const manager = {
  permissions: new Set([
    P.WORK_ORDERS_READ,
    P.WORK_ORDERS_CREATE,
    P.WORK_ORDERS_ASSIGN,
    P.WORK_ORDERS_VERIFY,
  ]),
  isExecutor: false,
};

describe('work order state machine', () => {
  it('walks the full field path for the executor', () => {
    const path = [S.ASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ON_SITE, S.IN_PROGRESS, S.COMPLETED];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(
        checkWorkOrderTransition(path[i], path[i + 1], fieldStaff, {
          completionDescription: 'Çukur kapatıldı.',
        }),
      ).toMatchObject({ ok: true });
    }
    expect(checkWorkOrderTransition(S.COMPLETED, S.VERIFIED, manager, {})).toMatchObject({
      ok: true,
    });
  });

  it('pauses and resumes work', () => {
    expect(
      checkWorkOrderTransition(S.IN_PROGRESS, S.WAITING, fieldStaff, { reason: 'Malzeme' }),
    ).toMatchObject({ ok: true, rule: { event: 'WAITING' } });
    expect(checkWorkOrderTransition(S.WAITING, S.IN_PROGRESS, fieldStaff, {})).toMatchObject({
      ok: true,
      rule: { event: 'RESUMED', requiresLocation: true },
    });
    expect(checkWorkOrderTransition(S.IN_PROGRESS, S.WAITING, fieldStaff, {})).toMatchObject({
      ok: false,
      reason: 'REASON_REQUIRED',
    });
  });

  it.each([
    [S.CREATED, S.IN_PROGRESS],
    [S.ASSIGNED, S.COMPLETED],
    [S.EN_ROUTE, S.COMPLETED],
    [S.VERIFIED, S.IN_PROGRESS],
    [S.CANCELLED, S.ASSIGNED],
    [S.IN_PROGRESS, S.CANCELLED],
  ])('rejects %s → %s', (from, to) => {
    expect(checkWorkOrderTransition(from, to, fieldStaff, { reason: 'x' })).toMatchObject({
      ok: false,
      reason: 'INVALID',
    });
  });

  it('keeps CREATED → ASSIGNED for the assignment endpoint', () => {
    expect(checkWorkOrderTransition(S.CREATED, S.ASSIGNED, manager, {})).toMatchObject({
      ok: false,
      reason: 'ASSIGNMENT_ONLY',
    });
  });

  it('lets only the people doing the work take field steps', () => {
    expect(checkWorkOrderTransition(S.ASSIGNED, S.ACCEPTED, colleague, {})).toMatchObject({
      ok: false,
      reason: 'NOT_EXECUTOR',
    });
    // A manager has no workOrders.execute at all.
    expect(checkWorkOrderTransition(S.ASSIGNED, S.ACCEPTED, manager, {})).toMatchObject({
      ok: false,
      reason: 'FORBIDDEN',
    });
    // Field staff cannot verify their own work, nor cancel it.
    expect(checkWorkOrderTransition(S.COMPLETED, S.VERIFIED, fieldStaff, {})).toMatchObject({
      ok: false,
      reason: 'FORBIDDEN',
    });
    expect(
      checkWorkOrderTransition(S.ASSIGNED, S.CANCELLED, fieldStaff, { reason: 'x' }),
    ).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
  });

  it('needs a completion description and marks the location steps', () => {
    expect(
      checkWorkOrderTransition(S.IN_PROGRESS, S.COMPLETED, fieldStaff, {
        completionDescription: '  ',
      }),
    ).toMatchObject({ ok: false, reason: 'COMPLETION_DESCRIPTION_REQUIRED' });
    const located = WORK_ORDER_TRANSITIONS.filter((r) => r.requiresLocation).map(
      (r) => `${r.from}→${r.to}`,
    );
    expect(located).toEqual(['EN_ROUTE→ON_SITE', 'ON_SITE→IN_PROGRESS', 'WAITING→IN_PROGRESS']);
  });

  it('lets a supervisor send completed work back (with a reason) and cancel early work', () => {
    expect(checkWorkOrderTransition(S.COMPLETED, S.IN_PROGRESS, manager, {})).toMatchObject({
      ok: false,
      reason: 'REASON_REQUIRED',
    });
    expect(
      checkWorkOrderTransition(S.COMPLETED, S.IN_PROGRESS, manager, { reason: 'Eksik' }),
    ).toMatchObject({ ok: true, rule: { event: 'RETURNED' } });
    for (const from of [S.CREATED, S.ASSIGNED, S.ACCEPTED]) {
      expect(
        checkWorkOrderTransition(from, S.CANCELLED, manager, { reason: 'Mükerrer' }),
      ).toMatchObject({ ok: true });
    }
  });

  it('offers the buttons the actor may use', () => {
    expect(availableWorkOrderTransitions(S.IN_PROGRESS, fieldStaff).map((r) => r.to)).toEqual([
      S.WAITING,
      S.COMPLETED,
    ]);
    expect(availableWorkOrderTransitions(S.IN_PROGRESS, colleague)).toEqual([]);
    expect(availableWorkOrderTransitions(S.CREATED, manager).map((r) => r.to)).toEqual([
      S.CANCELLED,
    ]);
    expect(availableWorkOrderTransitions(S.VERIFIED, manager)).toEqual([]);
  });

  it('allows (re)assignment only before the field work or while waiting', () => {
    expect([...ASSIGNABLE_STATUSES.keys()]).toEqual([S.CREATED, S.ASSIGNED, S.ACCEPTED, S.WAITING]);
    expect(ASSIGNABLE_STATUSES.get(S.ACCEPTED)).toBe(S.ASSIGNED);
    expect(ASSIGNABLE_STATUSES.get(S.WAITING)).toBe(S.WAITING);
    expect(ASSIGNABLE_STATUSES.has(S.IN_PROGRESS)).toBe(false);
  });

  it('describes a status change for the timeline', () => {
    expect(workOrderStatusDescription(S.ACCEPTED, S.EN_ROUTE)).toBe('Durum: Kabul Edildi → Yolda');
  });
});
