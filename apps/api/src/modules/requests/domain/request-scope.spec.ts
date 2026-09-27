import { Permission } from '@kent360/shared-types';
import { type AuthUser } from '../../../common/auth/auth-user';
import { requestReadScope, requestTitle } from './request-scope';

const user = (
  roles: string[],
  permissions: Permission[],
  departmentId: string | null = null,
): AuthUser => ({
  id: 'u1',
  municipalityId: 'm1',
  departmentId,
  email: 'x@y.z',
  firstName: 'A',
  lastName: 'B',
  roles,
  permissions: new Set(permissions),
  sessionId: 's1',
});

const { REQUESTS_READ, REQUESTS_READ_OWN, REQUESTS_CREATE } = Permission;

describe('requestReadScope', () => {
  it('gives a system admin the whole municipality', () => {
    expect(requestReadScope(user(['SYSTEM_ADMIN'], [REQUESTS_READ, REQUESTS_CREATE]))).toEqual({});
  });

  it('limits other staff to their department plus what they reported', () => {
    expect(
      requestReadScope(user(['DEPARTMENT_MANAGER'], [REQUESTS_READ, REQUESTS_CREATE], 'd1')),
    ).toEqual({
      OR: [{ departmentId: 'd1' }, { createdById: 'u1' }],
    });
    expect(requestReadScope(user(['TEAM_LEADER'], [REQUESTS_READ], 'd1'))).toEqual({
      departmentId: 'd1',
    });
  });

  it('gives staff without a department nothing by department', () => {
    expect(requestReadScope(user(['TEAM_LEADER'], [REQUESTS_READ]))).toBeNull();
  });

  it('limits citizens to their own requests', () => {
    expect(requestReadScope(user(['CITIZEN'], [REQUESTS_READ_OWN, REQUESTS_CREATE]))).toEqual({
      createdById: 'u1',
    });
  });

  it('gives nothing without request permissions', () => {
    expect(requestReadScope(user(['FIELD_STAFF'], []))).toBeNull();
  });
});

describe('requestTitle', () => {
  it('combines category and neighbourhood', () => {
    expect(requestTitle('Yol Çukuru', 'Karataş')).toBe('Yol Çukuru – Karataş');
    expect(requestTitle('Yol Çukuru', null)).toBe('Yol Çukuru');
  });
});
