import { RoleCode } from './enums';

/**
 * Permission catalogue. Codes are the single source of truth for both
 * backend guards (@RequirePermissions) and frontend UI gating.
 * The frontend only hides what the backend would reject anyway.
 */
export const Permission = {
  REQUESTS_READ: 'requests.read',
  REQUESTS_READ_OWN: 'requests.readOwn',
  REQUESTS_CREATE: 'requests.create',
  REQUESTS_UPDATE: 'requests.update',
  REQUESTS_ASSIGN: 'requests.assign',

  WORK_ORDERS_READ: 'workOrders.read',
  WORK_ORDERS_READ_ASSIGNED: 'workOrders.readAssigned',
  WORK_ORDERS_CREATE: 'workOrders.create',
  WORK_ORDERS_ASSIGN: 'workOrders.assign',
  WORK_ORDERS_EXECUTE: 'workOrders.execute',
  WORK_ORDERS_COMPLETE: 'workOrders.complete',
  WORK_ORDERS_VERIFY: 'workOrders.verify',

  FIELD_TEAMS_READ: 'fieldTeams.read',
  FIELD_TEAMS_MANAGE: 'fieldTeams.manage',

  MUNICIPALITY_READ: 'municipality.read',
  MUNICIPALITY_UPDATE: 'municipality.update',
  DEPARTMENTS_READ: 'departments.read',
  DEPARTMENTS_MANAGE: 'departments.manage',
  CATEGORIES_READ: 'categories.read',
  CATEGORIES_MANAGE: 'categories.manage',
  NEIGHBORHOODS_READ: 'neighborhoods.read',
  NEIGHBORHOODS_MANAGE: 'neighborhoods.manage',

  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',

  ANALYTICS_READ: 'analytics.read',
  REPORTS_EXPORT: 'reports.export',
  AUDIT_READ: 'audit.read',
  SETTINGS_MANAGE: 'settings.manage',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/**
 * Default permission sets per system role. Seeded into the database; municipalities
 * can later customise role→permission mappings without code changes.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  // Citizens pick a category and a location when reporting (Phase 5).
  [RoleCode.CITIZEN]: [
    Permission.REQUESTS_CREATE,
    Permission.REQUESTS_READ_OWN,
    Permission.CATEGORIES_READ,
    Permission.NEIGHBORHOODS_READ,
  ],
  [RoleCode.FIELD_STAFF]: [
    Permission.WORK_ORDERS_READ_ASSIGNED,
    Permission.WORK_ORDERS_EXECUTE,
    Permission.WORK_ORDERS_COMPLETE,
    Permission.DEPARTMENTS_READ,
    Permission.CATEGORIES_READ,
    Permission.NEIGHBORHOODS_READ,
  ],
  // Team leaders see the work orders of the teams they belong to (object scope), not
  // the whole department – that is workOrders.read (managers).
  [RoleCode.TEAM_LEADER]: [
    Permission.REQUESTS_READ,
    Permission.WORK_ORDERS_READ_ASSIGNED,
    Permission.WORK_ORDERS_ASSIGN,
    Permission.WORK_ORDERS_EXECUTE,
    Permission.WORK_ORDERS_COMPLETE,
    Permission.FIELD_TEAMS_READ,
    Permission.ANALYTICS_READ,
    Permission.MUNICIPALITY_READ,
    Permission.DEPARTMENTS_READ,
    Permission.CATEGORIES_READ,
    Permission.NEIGHBORHOODS_READ,
  ],
  [RoleCode.DEPARTMENT_MANAGER]: [
    Permission.REQUESTS_READ,
    Permission.REQUESTS_CREATE,
    Permission.REQUESTS_UPDATE,
    Permission.REQUESTS_ASSIGN,
    Permission.WORK_ORDERS_READ,
    Permission.WORK_ORDERS_CREATE,
    Permission.WORK_ORDERS_ASSIGN,
    Permission.WORK_ORDERS_VERIFY,
    Permission.FIELD_TEAMS_READ,
    Permission.FIELD_TEAMS_MANAGE,
    Permission.USERS_READ,
    Permission.ANALYTICS_READ,
    Permission.REPORTS_EXPORT,
    Permission.MUNICIPALITY_READ,
    Permission.DEPARTMENTS_READ,
    Permission.CATEGORIES_READ,
    Permission.NEIGHBORHOODS_READ,
  ],
  [RoleCode.SYSTEM_ADMIN]: ALL_PERMISSIONS,
};
