import { type Permission, RoleCode } from '@kent360/shared-types';
import { type Request } from 'express';

/**
 * The authenticated principal, rebuilt from the database on every request by
 * JwtAuthGuard – so deactivation, logout and permission changes apply immediately
 * instead of waiting for the access token to expire.
 */
export interface AuthUser {
  id: string;
  /** Every user belongs to exactly one municipality (tenant). */
  municipalityId: string;
  departmentId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  roles: readonly string[];
  permissions: ReadonlySet<Permission>;
  /** Refresh-token family of the current login session. */
  sessionId: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

/**
 * Row-level scope inside the tenant. There is intentionally no cross-municipality
 * "super admin" in the MVP: SYSTEM_ADMIN is the municipality's own administrator –
 * all permissions, but only within its municipality, and exempt from department
 * restrictions. A future platform operator must get an explicit permission and its
 * own code path, never a bypass of the tenant filter.
 */
export interface TenantContext {
  municipalityId: string;
  departmentId: string | null;
  /** false for SYSTEM_ADMIN; true users are limited to their own department where rules apply. */
  departmentScoped: boolean;
}

export function tenantContextOf(user: AuthUser): TenantContext {
  return {
    municipalityId: user.municipalityId,
    departmentId: user.departmentId,
    departmentScoped: !user.roles.includes(RoleCode.SYSTEM_ADMIN),
  };
}
