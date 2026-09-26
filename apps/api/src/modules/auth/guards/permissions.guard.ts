import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission } from '@kent360/shared-types';
import { type AuthenticatedRequest } from '../../../common/auth/auth-user';
import { PERMISSIONS_KEY } from '../../../common/decorators/auth.decorators';

/** Enforces @Permissions(...): the user must hold every listed permission. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !required.every((permission) => user.permissions.has(permission))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
