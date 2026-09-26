import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedRequest } from '../../../common/auth/auth-user';
import { IS_PUBLIC_KEY } from '../../../common/decorators/auth.decorators';
import { AuthService } from '../auth.service';
import { TokenService } from '../token.service';

/**
 * Global guard: every route requires a valid access token unless marked @Public().
 * The principal is reloaded from the database (see AuthService.resolveUser).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    const payload = this.tokens.verifyAccessToken(token);
    if (!payload) throw new UnauthorizedException();

    const user = await this.auth.resolveUser(payload);
    if (!user) throw new UnauthorizedException();

    request.user = user;
    return true;
  }
}
