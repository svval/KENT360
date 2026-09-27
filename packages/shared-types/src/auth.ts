import { type RoleCode, type UserStatus } from './enums';
import { type Permission } from './permissions';

/** The authenticated user as returned by /auth/login, /auth/refresh and /auth/me. */
export interface AuthUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  departmentId: string | null;
  /** Includes the branding the web console applies (white-label). */
  municipality: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
  };
  roles: { code: RoleCode | string; name: string }[];
  permissions: Permission[];
  lastLoginAt: string | null;
}

/**
 * Login / refresh result. The refresh token is never part of the body: web clients
 * receive it as an httpOnly cookie scoped to /api/v1/auth.
 */
export interface AuthTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: AuthUserProfile;
}

/** One login session (a refresh-token rotation family). */
export interface AuthSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

/** Audit log action codes written by the API. */
export const AuditAction = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  SESSION_REVOKED: 'SESSION_REVOKED',
  REFRESH_TOKEN_REUSE_DETECTED: 'REFRESH_TOKEN_REUSE_DETECTED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_PERMISSION_CHANGED: 'ROLE_PERMISSION_CHANGED',
  MUNICIPALITY_UPDATED: 'MUNICIPALITY_UPDATED',
  DEPARTMENT_CREATED: 'DEPARTMENT_CREATED',
  DEPARTMENT_UPDATED: 'DEPARTMENT_UPDATED',
  DEPARTMENT_STATUS_CHANGED: 'DEPARTMENT_STATUS_CHANGED',
  NEIGHBORHOOD_CREATED: 'NEIGHBORHOOD_CREATED',
  NEIGHBORHOOD_UPDATED: 'NEIGHBORHOOD_UPDATED',
  NEIGHBORHOOD_STATUS_CHANGED: 'NEIGHBORHOOD_STATUS_CHANGED',
  NEIGHBORHOODS_IMPORTED: 'NEIGHBORHOODS_IMPORTED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_STATUS_CHANGED: 'CATEGORY_STATUS_CHANGED',
  REQUEST_CREATED: 'REQUEST_CREATED',
  REQUEST_STATUS_CHANGED: 'REQUEST_STATUS_CHANGED',
  REQUEST_PRIORITY_CHANGED: 'REQUEST_PRIORITY_CHANGED',
  REQUEST_DEPARTMENT_CHANGED: 'REQUEST_DEPARTMENT_CHANGED',
  REQUEST_MEDIA_ADDED: 'REQUEST_MEDIA_ADDED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** User as listed by the users API (never includes credentials). */
export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  departmentId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { id: string; code: string; name: string }[];
}

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** System roles are shared by every municipality and cannot be edited via the API. */
  isSystem: boolean;
  permissions: Permission[];
  /** Users of the caller's municipality holding this role. */
  userCount: number;
}

export interface PermissionSummary {
  code: Permission;
  name: string;
  group: string;
}
