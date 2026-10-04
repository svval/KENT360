import { Permission, RequestStatus } from '@kent360/shared-types';
import {
  checkManualTransition,
  manualTransitions,
  REQUEST_TRANSITIONS,
  statusChangeDescription,
  TERMINAL_STATUSES,
} from './request-status.machine';

const S = RequestStatus;
const staff = new Set<string>([Permission.REQUESTS_UPDATE, Permission.REQUESTS_ASSIGN]);
const reviewerOnly = new Set<string>([Permission.REQUESTS_UPDATE]);

describe('request status machine', () => {
  it('has no transitions out of terminal statuses and no duplicates', () => {
    expect(REQUEST_TRANSITIONS.filter((r) => TERMINAL_STATUSES.has(r.from))).toEqual([]);
    const keys = REQUEST_TRANSITIONS.map((r) => `${r.from}>${r.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('follows ARCHITECTURE §6.1 – every status except terminal ones can move on', () => {
    for (const status of Object.values(S)) {
      if (TERMINAL_STATUSES.has(status)) continue;
      expect(REQUEST_TRANSITIONS.some((r) => r.from === status)).toBe(true);
    }
  });

  it.each([
    [S.NEW, S.UNDER_REVIEW],
    [S.UNDER_REVIEW, S.ASSIGNED_TO_DEPARTMENT],
    [S.ASSIGNED_TO_DEPARTMENT, S.UNDER_REVIEW],
  ])('allows %s → %s', (from, to) => {
    expect(checkManualTransition(from, to, staff, 'yeniden yönlendirme')).toMatchObject({
      ok: true,
    });
  });

  it.each([
    [S.NEW, S.CLOSED],
    [S.NEW, S.ASSIGNED_TO_DEPARTMENT],
    [S.NEW, S.RESOLVED],
    [S.REJECTED, S.UNDER_REVIEW],
    [S.CLOSED, S.NEW],
  ])('rejects the short-cut %s → %s', (from, to) => {
    expect(checkManualTransition(from, to, staff, 'x')).toMatchObject({
      ok: false,
      reason: 'INVALID',
    });
  });

  it('keeps AI and work-order transitions for their own workflows', () => {
    expect(checkManualTransition(S.NEW, S.AI_ANALYZED, staff, undefined)).toMatchObject({
      ok: false,
      reason: 'SYSTEM_ONLY',
    });
    expect(
      checkManualTransition(S.ASSIGNED_TO_DEPARTMENT, S.WORK_ORDER_CREATED, staff, undefined),
    ).toMatchObject({ ok: false, reason: 'SYSTEM_ONLY' });
  });

  it('requires the transition permission and a reason for rejections', () => {
    expect(
      checkManualTransition(S.UNDER_REVIEW, S.ASSIGNED_TO_DEPARTMENT, reviewerOnly, undefined),
    ).toMatchObject({
      ok: false,
      reason: 'FORBIDDEN',
    });
    expect(checkManualTransition(S.NEW, S.REJECTED, staff, '  ')).toMatchObject({
      ok: false,
      reason: 'REASON_REQUIRED',
    });
    expect(checkManualTransition(S.NEW, S.REJECTED, staff, 'Mükerrer')).toMatchObject({ ok: true });
  });

  it('lists the manual options per status and permission set', () => {
    expect(manualTransitions(S.NEW, staff).map((r) => r.to)).toEqual([S.UNDER_REVIEW, S.REJECTED]);
    expect(manualTransitions(S.UNDER_REVIEW, reviewerOnly).map((r) => r.to)).toEqual([S.REJECTED]);
    expect(manualTransitions(S.NEW, new Set())).toEqual([]);
  });

  it('closes a verified request manually (Phase 6), never an unverified one', () => {
    expect(checkManualTransition(S.VERIFIED, S.CLOSED, staff, undefined)).toMatchObject({
      ok: true,
    });
    expect(checkManualTransition(S.RESOLVED, S.CLOSED, staff, undefined)).toMatchObject({
      ok: false,
      reason: 'INVALID',
    });
    expect(checkManualTransition(S.IN_PROGRESS, S.RESOLVED, staff, undefined)).toMatchObject({
      ok: false,
      reason: 'SYSTEM_ONLY',
    });
  });

  it('describes a status change for the timeline', () => {
    expect(statusChangeDescription(S.NEW, S.UNDER_REVIEW)).toBe('Durum: Yeni → İncelemede');
  });
});
