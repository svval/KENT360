import { Permission } from '@kent360/shared-types';
import { type AuthUser, tenantContextOf } from '../../../common/auth/auth-user';

/**
 * Which work orders of the tenant a user may see (object scope on top of RBAC):
 *   • workOrders.read, SYSTEM_ADMIN          → every work order of the municipality;
 *   • workOrders.read, other staff           → work orders of their own department (manager);
 *   • workOrders.readAssigned                → assigned to them, or to a team they belong
 *                                              to (field staff, team leader).
 * Rules add up. The municipality itself is enforced by prisma.forTenant(); another
 * tenant's work order is always 404. List filters are ANDed with this scope, so a filter
 * (e.g. assignedUserId=<someone else>) can narrow the result but never widen it.
 * Returns null when the user may see no work order at all.
 */
export type WorkOrderScope =
  | Record<string, never>
  | { departmentId: string }
  | { assignedUserId: string }
  | { fieldTeamId: { in: string[] } }
  | { OR: object[] };

export function workOrderReadScope(
  actor: AuthUser,
  memberTeamIds: readonly string[],
): WorkOrderScope | null {
  const clauses: object[] = [];
  if (actor.permissions.has(Permission.WORK_ORDERS_READ)) {
    const tenant = tenantContextOf(actor);
    if (!tenant.departmentScoped) return {};
    if (tenant.departmentId) clauses.push({ departmentId: tenant.departmentId });
  }
  if (actor.permissions.has(Permission.WORK_ORDERS_READ_ASSIGNED)) {
    clauses.push({ assignedUserId: actor.id });
    if (memberTeamIds.length > 0) clauses.push({ fieldTeamId: { in: [...memberTeamIds] } });
  }
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? (clauses[0] as WorkOrderScope) : { OR: clauses };
}

export interface TeamMembership {
  teamId: string;
  role: 'LEADER' | 'MEMBER';
}

/**
 * The actor does the work of this work order: the assignee; a member of the assigned
 * team when no single person is assigned; or the leader of the assigned team.
 */
export function isWorkOrderExecutor(
  actorId: string,
  memberships: readonly TeamMembership[],
  workOrder: { assignedUserId: string | null; fieldTeamId: string | null },
): boolean {
  if (workOrder.assignedUserId === actorId) return true;
  if (!workOrder.fieldTeamId) return false;
  const membership = memberships.find((m) => m.teamId === workOrder.fieldTeamId);
  if (!membership) return false;
  return membership.role === 'LEADER' || workOrder.assignedUserId === null;
}

/**
 * Who may (re)assign: workOrders.assign plus, for team leaders without department-wide
 * rights (workOrders.read), only work orders of teams they lead – and only to those teams.
 * Returns the set of teams the actor may assign to, or 'department' for managers/admins.
 */
export function assignableTeams(
  actor: AuthUser,
  memberships: readonly TeamMembership[],
): 'department' | ReadonlySet<string> | null {
  if (!actor.permissions.has(Permission.WORK_ORDERS_ASSIGN)) return null;
  if (actor.permissions.has(Permission.WORK_ORDERS_READ)) return 'department';
  return new Set(memberships.filter((m) => m.role === 'LEADER').map((m) => m.teamId));
}
