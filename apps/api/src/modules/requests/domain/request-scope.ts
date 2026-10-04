import { Permission } from '@kent360/shared-types';
import { type AuthUser, tenantContextOf } from '../../../common/auth/auth-user';

/**
 * Which requests of the tenant a user may see (object scope on top of RBAC):
 *   • SYSTEM_ADMIN with requests.read           → every request of the municipality;
 *   • other staff with requests.read            → requests routed to their own department
 *                                                  (no department → none by this rule);
 *   • requests.readOwn or requests.create       → requests they reported themselves;
 *   • requests.readOwn                          → requests they joined (Phase 11, followers).
 * Rules add up (a manager also sees what they reported). The municipality itself is
 * enforced separately by prisma.forTenant(); another tenant's request is always 404.
 * Returns null when the user may see no request at all.
 */
export type RequestScope =
  | Record<string, never>
  | { departmentId: string }
  | { createdById: string }
  | { followers: { some: { userId: string } } }
  | { OR: object[] };

export function requestReadScope(actor: AuthUser): RequestScope | null {
  const clauses: object[] = [];
  if (actor.permissions.has(Permission.REQUESTS_READ)) {
    const tenant = tenantContextOf(actor);
    if (!tenant.departmentScoped) return {};
    if (tenant.departmentId) clauses.push({ departmentId: tenant.departmentId });
  }
  if (
    actor.permissions.has(Permission.REQUESTS_READ_OWN) ||
    actor.permissions.has(Permission.REQUESTS_CREATE)
  ) {
    clauses.push({ createdById: actor.id });
  }
  if (actor.permissions.has(Permission.REQUESTS_READ_OWN)) {
    clauses.push({ followers: { some: { userId: actor.id } } });
  }
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? (clauses[0] as RequestScope) : { OR: clauses };
}

/** Staff act on requests; citizens only report and follow theirs. */
export function isMunicipalStaff(actor: AuthUser): boolean {
  return actor.permissions.has(Permission.REQUESTS_READ);
}

/** Title shown in lists: "Yol Çukuru – Karataş" (the model requires one; citizens are not asked). */
export function requestTitle(categoryName: string, neighborhoodName: string | null): string {
  const title = neighborhoodName ? `${categoryName} – ${neighborhoodName}` : categoryName;
  return title.slice(0, 200);
}
