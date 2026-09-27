import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@kent360/shared-types';
import { type AuthUser } from '../../../common/auth/auth-user';
import {
  ANY_PERMISSIONS_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from '../../../common/decorators/auth.decorators';
import { type AuthService } from '../auth.service';
import { type AccessTokenPayload, type TokenService } from '../token.service';
import { throttleTracker } from './app-throttler.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';

const user: AuthUser = {
  id: 'u1',
  municipalityId: 'm1',
  departmentId: null,
  email: 'manager@kent360.local',
  firstName: 'Elif',
  lastName: 'Demir',
  roles: ['DEPARTMENT_MANAGER'],
  permissions: new Set([Permission.REQUESTS_READ, Permission.USERS_READ]),
  sessionId: 's1',
};

function context(request: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  const handler = () => undefined;
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => metadata[key as string]);
  const ctx = {
    getHandler: () => handler,
    getClass: () => Object,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

describe('PermissionsGuard', () => {
  it('allows routes without @Permissions', () => {
    const { ctx, reflector } = context({ user });
    expect(new PermissionsGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('allows when every required permission is held', () => {
    const { ctx, reflector } = context(
      { user },
      { [PERMISSIONS_KEY]: [Permission.REQUESTS_READ, Permission.USERS_READ] },
    );
    expect(new PermissionsGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('denies when any required permission is missing', () => {
    const { ctx, reflector } = context(
      { user },
      { [PERMISSIONS_KEY]: [Permission.REQUESTS_READ, Permission.USERS_MANAGE] },
    );
    expect(() => new PermissionsGuard(reflector).canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies when no user is attached', () => {
    const { ctx, reflector } = context({}, { [PERMISSIONS_KEY]: [Permission.REQUESTS_READ] });
    expect(() => new PermissionsGuard(reflector).canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows @PermissionsAny when at least one permission is held', () => {
    const { ctx, reflector } = context(
      { user },
      { [ANY_PERMISSIONS_KEY]: [Permission.REQUESTS_READ_OWN, Permission.REQUESTS_READ] },
    );
    expect(new PermissionsGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('denies @PermissionsAny when none is held', () => {
    const { ctx, reflector } = context(
      { user },
      { [ANY_PERMISSIONS_KEY]: [Permission.REQUESTS_CREATE, Permission.REQUESTS_UPDATE] },
    );
    expect(() => new PermissionsGuard(reflector).canActivate(ctx)).toThrow(ForbiddenException);
  });
});

describe('JwtAuthGuard', () => {
  const payload: AccessTokenPayload = { sub: 'u1', mid: 'm1', sid: 's1', roles: [], typ: 'access' };
  const tokens = {
    verifyAccessToken: (t: string) => (t === 'good' ? payload : null),
  } as unknown as TokenService;
  const auth = {
    resolveUser: jest.fn(async (p: AccessTokenPayload) => (p.sid === 's1' ? user : null)),
  } as unknown as AuthService;

  it('skips @Public routes', async () => {
    const { ctx, reflector } = context({ headers: {} }, { [IS_PUBLIC_KEY]: true });
    await expect(new JwtAuthGuard(reflector, tokens, auth).canActivate(ctx)).resolves.toBe(true);
  });

  it.each([
    {},
    { authorization: 'Basic abc' },
    { authorization: 'Bearer' },
    { authorization: 'Bearer bad' },
  ])('rejects %p', async (headers) => {
    const { ctx, reflector } = context({ headers });
    await expect(new JwtAuthGuard(reflector, tokens, auth).canActivate(ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches the reloaded user for a valid token', async () => {
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer good' } };
    const { ctx, reflector } = context(request);
    await expect(new JwtAuthGuard(reflector, tokens, auth).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toBe(user);
  });

  it('rejects a valid token whose session/user no longer resolves', async () => {
    (auth.resolveUser as jest.Mock).mockResolvedValueOnce(null);
    const { ctx, reflector } = context({ headers: { authorization: 'Bearer good' } });
    await expect(new JwtAuthGuard(reflector, tokens, auth).canActivate(ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('throttleTracker', () => {
  it('keys login attempts by IP + normalised e-mail', () => {
    expect(
      throttleTracker({ ip: '1.2.3.4', path: '/api/v1/auth/login', body: { email: ' A@B.C ' } }),
    ).toBe('1.2.3.4|a@b.c');
  });

  it('keys everything else by IP', () => {
    expect(
      throttleTracker({ ip: '1.2.3.4', path: '/api/v1/users', body: { email: 'a@b.c' } }),
    ).toBe('1.2.3.4');
    expect(throttleTracker({ ip: '1.2.3.4', path: '/api/v1/auth/login', body: undefined })).toBe(
      '1.2.3.4',
    );
  });
});
