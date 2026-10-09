import { CITIZEN_NOTIFICATION_TYPES, Permission } from '@kent360/shared-types';
import {
  citizenRequestUpdate,
  citizenStatusChange,
  isInternalReader,
  recipientsOf,
  requestAssignedNotification,
  slaNotification,
  visibleNotificationTypes,
  workOrderReturnedNotification,
} from './notification-rules';

describe('notification rules', () => {
  it('never notifies the actor and removes duplicates / empty ids', () => {
    expect(recipientsOf(['a', 'b', 'a', null, undefined, 'actor'], 'actor')).toEqual(['a', 'b']);
    expect(recipientsOf(['actor'], 'actor')).toEqual([]);
    expect(recipientsOf(['a'], null)).toEqual(['a']);
  });

  it('treats users without internal read rights as citizens', () => {
    const citizen = new Set<string>([Permission.REQUESTS_CREATE, Permission.REQUESTS_READ_OWN]);
    expect(isInternalReader(citizen)).toBe(false);
    expect(visibleNotificationTypes(citizen)).toEqual(CITIZEN_NOTIFICATION_TYPES);
    for (const permission of [
      Permission.REQUESTS_READ,
      Permission.WORK_ORDERS_READ,
      Permission.WORK_ORDERS_READ_ASSIGNED,
    ]) {
      expect(visibleNotificationTypes(new Set<string>([permission]))).toBeNull();
    }
  });

  it('builds staff messages with numbers and context', () => {
    const assigned = requestAssignedNotification({
      requestId: 'r1',
      publicNumber: 'KNT-2026-000001',
      categoryName: 'Yol Çukuru',
      neighborhoodName: 'Karataş',
      departmentName: 'Fen İşleri',
      priority: 'CRITICAL',
    });
    expect(assigned).toMatchObject({
      type: 'REQUEST_ASSIGNED',
      entityType: 'Request',
      entityId: 'r1',
    });
    expect(assigned.title).toBe('Yeni talep: KNT-2026-000001');
    expect(assigned.message).toContain('Karataş');
    expect(assigned.message).toContain('Kritik');

    expect(
      slaNotification({ kind: 'SLA_BREACHED', requestId: 'r', publicNumber: 'N', title: 'T' }),
    ).toMatchObject({ type: 'SLA_BREACHED', title: 'SLA aşıldı: N' });
    expect(
      slaNotification({ kind: 'SLA_AT_RISK', requestId: 'r', publicNumber: 'N', title: 'T' }).type,
    ).toBe('SLA_AT_RISK');
    expect(
      workOrderReturnedNotification({ workOrderId: 'w', publicNumber: 'WO', reason: 'Foto eksik' })
        .message,
    ).toContain('Gerekçe: Foto eksik');
  });

  it('citizen messages are citizen types and bounded', () => {
    expect(
      citizenRequestUpdate({ requestId: 'r', publicNumber: 'N', description: 'x', verified: true })
        .type,
    ).toBe('REQUEST_VERIFIED');
    const update = citizenStatusChange({
      requestId: 'r',
      publicNumber: 'N',
      to: 'REJECTED',
      reason: 'Mükerrer',
    });
    expect(CITIZEN_NOTIFICATION_TYPES).toContain(update.type);
    expect(update.message).toContain('Reddedildi');
    expect(update.message).toContain('Mükerrer');
    const long = citizenRequestUpdate({
      requestId: 'r',
      publicNumber: 'N',
      description: 'x'.repeat(5000),
    });
    expect(long.message.length).toBe(1000);
  });
});
