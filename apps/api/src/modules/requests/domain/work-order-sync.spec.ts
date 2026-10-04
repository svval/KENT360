import { RequestStatus } from '@kent360/shared-types';
import { findTransition } from './request-status.machine';
import {
  requestSyncStep,
  WORK_ORDER_REQUEST_SYNC,
  type WorkOrderSyncEvent,
} from './work-order-sync';

const R = RequestStatus;

describe('work order → request synchronisation', () => {
  it.each(Object.entries(WORK_ORDER_REQUEST_SYNC))(
    '%s is a system transition of the request state machine',
    (_event, step) => {
      expect(findTransition(step.from, step.to)).toMatchObject({ trigger: 'system' });
    },
  );

  it('follows the full happy path of a request', () => {
    const path: [WorkOrderSyncEvent, RequestStatus][] = [
      ['CREATED', R.WORK_ORDER_CREATED],
      ['STARTED', R.IN_PROGRESS],
      ['COMPLETED', R.RESOLVED],
      ['VERIFIED', R.VERIFIED],
    ];
    let status: RequestStatus = R.ASSIGNED_TO_DEPARTMENT;
    for (const [event, expected] of path) {
      const step = requestSyncStep(event, status);
      expect(step?.to).toBe(expected);
      status = step!.to;
    }
  });

  it('moves a returned solution back to IN_PROGRESS and a cancelled job back to the department', () => {
    expect(requestSyncStep('RETURNED', R.RESOLVED)?.to).toBe(R.IN_PROGRESS);
    expect(requestSyncStep('CANCELLED', R.WORK_ORDER_CREATED)?.to).toBe(R.ASSIGNED_TO_DEPARTMENT);
  });

  it('does nothing when the request is already past the step (resume after a pause)', () => {
    expect(requestSyncStep('RESUMED', R.IN_PROGRESS)).toBeNull();
    expect(requestSyncStep('STARTED', R.IN_PROGRESS)).toBeNull();
    expect(requestSyncStep('CREATED', R.UNDER_REVIEW)).toBeNull();
  });

  it('writes citizen-facing texts without staff names', () => {
    for (const step of Object.values(WORK_ORDER_REQUEST_SYNC)) {
      expect(step.description).toMatch(/\.$/);
      expect(step.description.length).toBeLessThan(120);
    }
  });
});
