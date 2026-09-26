import { effectivePermissions, effectiveRoles } from './user-profile';

const role = (code: string, municipalityId: string | null, permissions: string[]) => ({
  role: {
    code,
    name: code,
    municipalityId,
    permissions: permissions.map((p) => ({ permission: { code: p } })),
  },
});

describe('effective roles and permissions', () => {
  const user = {
    municipalityId: 'm1',
    roles: [
      role('FIELD_STAFF', null, ['workOrders.execute', 'workOrders.readAssigned']),
      role('PARK_INSPECTOR', 'm1', ['requests.read', 'workOrders.execute']),
      role('FOREIGN_ADMIN', 'm2', ['users.manage', 'roles.manage']),
      role('LEGACY', null, ['legacy.unknown']),
    ],
  };

  it('ignores roles of other municipalities', () => {
    expect(effectiveRoles(user).map((r) => r.code)).toEqual([
      'FIELD_STAFF',
      'PARK_INSPECTOR',
      'LEGACY',
    ]);
  });

  it('unions permissions, deduplicated, sorted and limited to the catalogue', () => {
    expect(effectivePermissions(user)).toEqual([
      'requests.read',
      'workOrders.execute',
      'workOrders.readAssigned',
    ]);
  });
});
