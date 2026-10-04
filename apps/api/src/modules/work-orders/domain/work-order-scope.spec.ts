import { Permission } from '@kent360/shared-types';
import { type AuthUser } from '../../../common/auth/auth-user';
import { assignableTeams, isWorkOrderExecutor, workOrderReadScope } from './work-order-scope';

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

const P = Permission;
const admin = user(['SYSTEM_ADMIN'], Object.values(P));
const manager = user(
  ['DEPARTMENT_MANAGER'],
  [P.WORK_ORDERS_READ, P.WORK_ORDERS_ASSIGN, P.WORK_ORDERS_VERIFY],
  'd1',
);
const leader = user(
  ['TEAM_LEADER'],
  [P.WORK_ORDERS_READ_ASSIGNED, P.WORK_ORDERS_ASSIGN, P.WORK_ORDERS_EXECUTE],
  'd1',
);
const field = user(['FIELD_STAFF'], [P.WORK_ORDERS_READ_ASSIGNED, P.WORK_ORDERS_EXECUTE], 'd1');
const citizen = user(['CITIZEN'], [P.REQUESTS_CREATE, P.REQUESTS_READ_OWN]);

describe('workOrderReadScope', () => {
  it('gives the municipality admin every work order', () => {
    expect(workOrderReadScope(admin, [])).toEqual({});
  });

  it('limits a manager to the department', () => {
    expect(workOrderReadScope(manager, ['t9'])).toEqual({ departmentId: 'd1' });
  });

  it('limits field staff and team leaders to their own and their teams’ work', () => {
    expect(workOrderReadScope(field, [])).toEqual({ assignedUserId: 'u1' });
    expect(workOrderReadScope(leader, ['t1', 't2'])).toEqual({
      OR: [{ assignedUserId: 'u1' }, { fieldTeamId: { in: ['t1', 't2'] } }],
    });
  });

  it('shows nothing to users without work order permissions or department', () => {
    expect(workOrderReadScope(citizen, ['t1'])).toBeNull();
    expect(workOrderReadScope(user(['DEPARTMENT_MANAGER'], [P.WORK_ORDERS_READ]), [])).toBeNull();
  });
});

describe('isWorkOrderExecutor', () => {
  const team = [{ teamId: 't1', role: 'MEMBER' as const }];
  it('is the assignee', () => {
    expect(isWorkOrderExecutor('u1', [], { assignedUserId: 'u1', fieldTeamId: null })).toBe(true);
  });
  it('is any team member when only the team is assigned', () => {
    expect(isWorkOrderExecutor('u1', team, { assignedUserId: null, fieldTeamId: 't1' })).toBe(true);
  });
  it('is not a team member when a colleague is assigned – but the team leader is', () => {
    expect(isWorkOrderExecutor('u1', team, { assignedUserId: 'u2', fieldTeamId: 't1' })).toBe(
      false,
    );
    expect(
      isWorkOrderExecutor('u1', [{ teamId: 't1', role: 'LEADER' }], {
        assignedUserId: 'u2',
        fieldTeamId: 't1',
      }),
    ).toBe(true);
  });
  it('is nobody outside the team', () => {
    expect(isWorkOrderExecutor('u1', team, { assignedUserId: null, fieldTeamId: 't2' })).toBe(
      false,
    );
  });
});

describe('assignableTeams', () => {
  it('lets managers and admins assign within the department', () => {
    expect(assignableTeams(manager, [])).toBe('department');
    expect(assignableTeams(admin, [])).toBe('department');
  });
  it('limits team leaders to the teams they lead', () => {
    const teams = assignableTeams(leader, [
      { teamId: 't1', role: 'LEADER' },
      { teamId: 't2', role: 'MEMBER' },
    ]);
    expect(teams).toEqual(new Set(['t1']));
  });
  it('refuses users without workOrders.assign', () => {
    expect(assignableTeams(field, [{ teamId: 't1', role: 'LEADER' }])).toBeNull();
  });
});
