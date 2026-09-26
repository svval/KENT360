import { ALL_PERMISSIONS, type AuthUserProfile, type Permission } from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

/** Everything needed to authorise a request or describe the user – never the password hash. */
export const authUserSelect = {
  id: true,
  municipalityId: true,
  departmentId: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  lastLoginAt: true,
  municipality: { select: { id: true, name: true, slug: true } },
  roles: {
    select: {
      role: {
        select: {
          code: true,
          name: true,
          municipalityId: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

/**
 * Roles that actually apply: system roles (municipalityId = NULL) or roles of the
 * user's own municipality. A mis-assigned foreign role grants nothing.
 */
export function effectiveRoles(user: Pick<AuthUserRecord, 'municipalityId' | 'roles'>) {
  return user.roles
    .map(({ role }) => role)
    .filter((role) => role.municipalityId === null || role.municipalityId === user.municipalityId);
}

/** Union of role permissions, restricted to the shared-types catalogue. */
export function effectivePermissions(
  user: Pick<AuthUserRecord, 'municipalityId' | 'roles'>,
): Permission[] {
  const codes = new Set<Permission>();
  for (const role of effectiveRoles(user)) {
    for (const { permission } of role.permissions) {
      if (KNOWN_PERMISSIONS.has(permission.code)) codes.add(permission.code as Permission);
    }
  }
  return [...codes].sort();
}

export function toAuthUserProfile(user: AuthUserRecord): AuthUserProfile {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    departmentId: user.departmentId,
    municipality: user.municipality,
    roles: effectiveRoles(user).map(({ code, name }) => ({ code, name })),
    permissions: effectivePermissions(user),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}
