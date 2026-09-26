/**
 * Domain enums shared by API, web and mobile.
 * They mirror the Prisma enums in apps/api/prisma/schema.prisma; the API test suite
 * asserts that both stay in sync.
 */

export const RequestStatus = {
  NEW: 'NEW',
  AI_ANALYZED: 'AI_ANALYZED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ASSIGNED_TO_DEPARTMENT: 'ASSIGNED_TO_DEPARTMENT',
  WORK_ORDER_CREATED: 'WORK_ORDER_CREATED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  VERIFIED: 'VERIFIED',
  CLOSED: 'CLOSED',
  REJECTED: 'REJECTED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const WorkOrderStatus = {
  CREATED: 'CREATED',
  ASSIGNED: 'ASSIGNED',
  ACCEPTED: 'ACCEPTED',
  EN_ROUTE: 'EN_ROUTE',
  ON_SITE: 'ON_SITE',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING: 'WAITING',
  COMPLETED: 'COMPLETED',
  VERIFIED: 'VERIFIED',
  CANCELLED: 'CANCELLED',
} as const;
export type WorkOrderStatus = (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

export const Priority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const RequestSource = {
  WEB: 'WEB',
  MOBILE: 'MOBILE',
  CALL_CENTER: 'CALL_CENTER',
  MUNICIPAL_STAFF: 'MUNICIPAL_STAFF',
  API: 'API',
} as const;
export type RequestSource = (typeof RequestSource)[keyof typeof RequestSource];

export const WorkOrderMediaType = {
  BEFORE: 'BEFORE',
  DURING: 'DURING',
  AFTER: 'AFTER',
} as const;
export type WorkOrderMediaType = (typeof WorkOrderMediaType)[keyof typeof WorkOrderMediaType];

/** Computed, never stored: derived from slaDueAt and the current time. */
export const SlaStatus = {
  ON_TIME: 'ON_TIME',
  AT_RISK: 'AT_RISK',
  BREACHED: 'BREACHED',
} as const;
export type SlaStatus = (typeof SlaStatus)[keyof typeof SlaStatus];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  SUSPENDED: 'SUSPENDED',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const RoleCode = {
  CITIZEN: 'CITIZEN',
  FIELD_STAFF: 'FIELD_STAFF',
  TEAM_LEADER: 'TEAM_LEADER',
  DEPARTMENT_MANAGER: 'DEPARTMENT_MANAGER',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];
