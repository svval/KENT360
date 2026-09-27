import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission } from '@kent360/shared-types';
import { type AuthenticatedRequest } from '../../../common/auth/auth-user';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../../../common/decorators/auth.decorators';

/** Enforces @Permissions(...) (all of) and @PermissionsAny(...) (at least one of). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const all = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    const any = this.reflector.getAllAndOverride<Permission[] | undefined>(
      ANY_PERMISSIONS_KEY,
      targets,
    );
    if (!all?.length && !any?.length) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    const allowed =
      user !== undefined &&
      (all ?? []).every((permission) => user.permissions.has(permission)) &&
      (!any?.length || any.some((permission) => user.permissions.has(permission)));
    if (!allowed) throw new ForbiddenException();
    return true;
  }
}
