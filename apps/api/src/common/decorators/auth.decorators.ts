import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { type Permission } from '@kent360/shared-types';
import { type AuthenticatedRequest, type AuthUser, tenantContextOf } from '../auth/auth-user';
import { requestMetaOf } from '../utils/request-meta';

export const IS_PUBLIC_KEY = 'kent360:isPublic';
export const PERMISSIONS_KEY = 'kent360:permissions';
export const ANY_PERMISSIONS_KEY = 'kent360:anyPermissions';

/** Opts a route out of JwtAuthGuard (every route requires a session by default). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Requires ALL listed permissions. Checked by PermissionsGuard on the backend –
 * the frontend only hides what would be rejected here anyway.
 */
export const Permissions = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Requires AT LEAST ONE of the listed permissions – for routes whose object scope then
 * depends on which one the user holds (e.g. requests.read vs requests.readOwn).
 */
export const PermissionsAny = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

function userOf(ctx: ExecutionContext): AuthUser {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  // Reaching a handler without a user means the route forgot @Public() semantics.
  if (!user) throw new Error('@CurrentUser() used on a route without an authenticated user');
  return user;
}

/** The authenticated user (routes behind JwtAuthGuard only). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => userOf(ctx));

/** Tenant + department scope of the authenticated user. */
export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  tenantContextOf(userOf(ctx)),
);

/** Client IP and user agent, for audit and session records. */
export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  requestMetaOf(ctx.switchToHttp().getRequest()),
);
