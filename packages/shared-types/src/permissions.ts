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

  DEPARTMENTS_MANAGE: 'departments.manage',
  CATEGORIES_MANAGE: 'categories.manage',
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
  [RoleCode.CITIZEN]: [Permission.REQUESTS_CREATE, Permission.REQUESTS_READ_OWN],
  [RoleCode.FIELD_STAFF]: [
    Permission.WORK_ORDERS_READ_ASSIGNED,
    Permission.WORK_ORDERS_EXECUTE,
    Permission.WORK_ORDERS_COMPLETE,
  ],
  [RoleCode.TEAM_LEADER]: [
    Permission.REQUESTS_READ,
    Permission.WORK_ORDERS_READ,
    Permission.WORK_ORDERS_ASSIGN,
    Permission.WORK_ORDERS_EXECUTE,
    Permission.WORK_ORDERS_COMPLETE,
    Permission.FIELD_TEAMS_READ,
    Permission.ANALYTICS_READ,
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
  ],
  [RoleCode.SYSTEM_ADMIN]: ALL_PERMISSIONS,
};
