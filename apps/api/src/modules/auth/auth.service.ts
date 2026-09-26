import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  AuditAction,
  type AuthSession,
  type AuthTokenResponse,
  type AuthUserProfile,
  UserStatus,
} from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { afterFailedLogin, isLocked, normalizeEmail } from './domain/login-policy';
import { type LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import { type AccessTokenPayload, TokenService } from './token.service';
import {
  authUserSelect,
  effectivePermissions,
  effectiveRoles,
  toAuthUserProfile,
} from './user-profile';

/** Result of login/refresh: the body for the client plus the cookie material. */
export interface IssuedSession {
  response: AuthTokenResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

type Db = Prisma.TransactionClient | PrismaService;

/** Thrown inside the rotation transaction when another request consumed the token first. */
class RefreshTokenRaceError extends Error {}

const invalidCredentials = () =>
  new AppException(
    ErrorCode.INVALID_CREDENTIALS,
    'E-posta veya şifre hatalı.',
    HttpStatus.UNAUTHORIZED,
  );

const invalidRefreshToken = () =>
  new AppException(
    ErrorCode.INVALID_REFRESH_TOKEN,
    'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
    HttpStatus.UNAUTHORIZED,
  );

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, meta: RequestMeta): Promise<IssuedSession> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        municipalityId: true,
        passwordHash: true,
        status: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      await this.passwords.verifyAgainstDummy(dto.password);
      // The attempted address is attacker-controlled input: it is neither logged nor audited.
      this.logger.warn({ event: 'login_failed', reason: 'UNKNOWN_ACCOUNT' }, 'Login failed');
      throw invalidCredentials();
    }

    const now = new Date();
    const passwordOk = await this.passwords.verify(user.passwordHash, dto.password);
    const base = {
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      municipalityId: user.municipalityId,
      meta,
    };

    if (!passwordOk) {
      // Attempts during a lock do not extend it (no lock-out amplification).
      if (!isLocked(user.lockedUntil, now)) await this.registerFailedLogin(user.id, now, base);
      else
        await this.audit.record({
          ...base,
          action: AuditAction.LOGIN_FAILED,
          after: { reason: 'ACCOUNT_LOCKED' },
        });
      throw invalidCredentials();
    }

    // Lock and status are revealed only to someone who knows the password.
    if (isLocked(user.lockedUntil, now)) {
      await this.audit.record({
        ...base,
        action: AuditAction.LOGIN_FAILED,
        after: { reason: 'ACCOUNT_LOCKED' },
      });
      throw new AppException(
        ErrorCode.ACCOUNT_LOCKED,
        'Çok fazla başarısız giriş denemesi nedeniyle hesabınız geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin.',
        HttpStatus.LOCKED,
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      await this.audit.record({
        ...base,
        action: AuditAction.LOGIN_FAILED,
        after: { reason: 'ACCOUNT_INACTIVE', status: user.status },
      });
      throw new AppException(
        ErrorCode.ACCOUNT_DISABLED,
        'Hesabınız aktif değil. Lütfen belediyenizle iletişime geçin.',
        HttpStatus.FORBIDDEN,
      );
    }

    const familyId = randomUUID();
    const refresh = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
      });
      const issued = await this.createRefreshToken(tx, user.id, familyId, meta);
      await this.audit.record(
        { ...base, action: AuditAction.LOGIN_SUCCESS, after: { sessionId: familyId } },
        tx,
      );
      return issued;
    });

    return this.buildSession(user.id, familyId, refresh);
  }

  private async registerFailedLogin(
    userId: string,
    now: Date,
    base: {
      entityType: string;
      entityId: string;
      userId: string;
      municipalityId: string;
      meta: RequestMeta;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Atomic increment: concurrent failures cannot under-count.
      const { failedLoginCount } = await tx.user.update({
        where: { id: userId },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      await this.audit.record(
        {
          ...base,
          action: AuditAction.LOGIN_FAILED,
          after: { reason: 'INVALID_PASSWORD', failedLoginCount },
        },
        tx,
      );

      const decision = afterFailedLogin(failedLoginCount, now);
      if (decision.lock) {
        await tx.user.update({
          where: { id: userId },
          data: { failedLoginCount: 0, lockedUntil: decision.lockedUntil },
        });
        await this.audit.record(
          {
            ...base,
            action: AuditAction.ACCOUNT_LOCKED,
            after: { lockedUntil: decision.lockedUntil },
          },
          tx,
        );
      }
    });
  }

  // ─── Refresh (rotation + reuse detection) ─────────────────────────────────

  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<IssuedSession> {
    if (!rawToken) throw invalidRefreshToken();

    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(rawToken) },
    });
    if (!current) throw invalidRefreshToken();

    if (current.revokedAt) {
      // A token that was already rotated is being replayed: assume it was stolen.
      if (current.replacedById) await this.handleReuse(current, meta);
      throw invalidRefreshToken();
    }
    const now = new Date();
    if (current.expiresAt <= now) throw invalidRefreshToken();

    const user = await this.prisma.user.findUnique({
      where: { id: current.userId },
      select: { status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.revokeFamily(current.familyId, now);
      throw invalidRefreshToken();
    }

    let refresh: { raw: string; expiresAt: Date };
    try {
      refresh = await this.prisma.$transaction(async (tx) => {
        const next = await this.createRefreshToken(tx, current.userId, current.familyId, meta);
        // Conditional claim: exactly one concurrent request can rotate a given token.
        const claimed = await tx.refreshToken.updateMany({
          where: { id: current.id, revokedAt: null },
          data: { revokedAt: now, replacedById: next.id },
        });
        if (claimed.count !== 1) throw new RefreshTokenRaceError();
        return next;
      });
    } catch (error) {
      if (error instanceof RefreshTokenRaceError) {
        await this.handleReuse(current, meta);
        throw invalidRefreshToken();
      }
      throw error;
    }

    return this.buildSession(current.userId, current.familyId, refresh);
  }

  private async handleReuse(
    token: { id: string; userId: string; familyId: string },
    meta: RequestMeta,
  ): Promise<void> {
    const revoked = await this.revokeFamily(token.familyId, new Date());
    const owner = await this.prisma.user.findUnique({
      where: { id: token.userId },
      select: { municipalityId: true },
    });
    this.logger.warn(
      { event: 'refresh_token_reuse', userId: token.userId, sessionId: token.familyId },
      'Refresh token reuse detected – session revoked',
    );
    await this.audit.record({
      action: AuditAction.REFRESH_TOKEN_REUSE_DETECTED,
      entityType: 'Session',
      entityId: token.familyId,
      userId: token.userId,
      municipalityId: owner?.municipalityId ?? null,
      after: { sessionId: token.familyId, reusedTokenId: token.id, revokedTokens: revoked },
      meta,
    });
  }

  // ─── Logout & sessions ────────────────────────────────────────────────────

  /** Revokes the session behind the refresh cookie. Idempotent; works with an expired access token. */
  async logout(rawToken: string | undefined, meta: RequestMeta): Promise<void> {
    if (!rawToken) return;
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(rawToken) },
      select: {
        familyId: true,
        userId: true,
        revokedAt: true,
        user: { select: { municipalityId: true } },
      },
    });
    if (!token || token.revokedAt) return;

    await this.prisma.$transaction(async (tx) => {
      await this.revokeFamily(token.familyId, new Date(), tx);
      await this.audit.record(
        {
          action: AuditAction.LOGOUT,
          entityType: 'Session',
          entityId: token.familyId,
          userId: token.userId,
          municipalityId: token.user.municipalityId,
          meta,
        },
        tx,
      );
    });
  }

  async logoutAll(user: AuthUser, meta: RequestMeta): Promise<{ revokedSessions: number }> {
    return this.prisma.$transaction(async (tx) => {
      const families = await tx.refreshToken.findMany({
        where: { userId: user.id, revokedAt: null },
        distinct: ['familyId'],
        select: { familyId: true },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: AuditAction.LOGOUT_ALL,
          entityType: 'User',
          entityId: user.id,
          userId: user.id,
          municipalityId: user.municipalityId,
          after: { revokedSessions: families.length },
          meta,
        },
        tx,
      );
      return { revokedSessions: families.length };
    });
  }

  async listSessions(user: AuthUser): Promise<AuthSession[]> {
    const now = new Date();
    const active = await this.prisma.refreshToken.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    const started = await this.prisma.refreshToken.groupBy({
      by: ['familyId'],
      where: { familyId: { in: active.map((t) => t.familyId) } },
      _min: { createdAt: true },
    });
    const startedAt = new Map(started.map((row) => [row.familyId, row._min.createdAt]));

    return active.map((token) => ({
      id: token.familyId,
      createdAt: (startedAt.get(token.familyId) ?? token.createdAt).toISOString(),
      lastUsedAt: token.createdAt.toISOString(),
      expiresAt: token.expiresAt.toISOString(),
      ipAddress: token.ipAddress,
      userAgent: token.userAgent,
      current: token.familyId === user.sessionId,
    }));
  }

  async revokeSession(user: AuthUser, sessionId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { userId: user.id, familyId: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) {
        throw AppException.notFound(ErrorCode.SESSION_NOT_FOUND, 'Oturum bulunamadı.');
      }
      await this.audit.record(
        {
          action: AuditAction.SESSION_REVOKED,
          entityType: 'Session',
          entityId: sessionId,
          userId: user.id,
          municipalityId: user.municipalityId,
          meta,
        },
        tx,
      );
    });
  }

  // ─── Request authentication (JwtAuthGuard) ────────────────────────────────

  /**
   * Rebuilds the principal from the database. Returns null (→ 401) when the user is
   * gone or inactive, the tenant claim does not match, or the session was revoked –
   * so logout / deactivation take effect before the access token expires.
   */
  async resolveUser(payload: AccessTokenPayload): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        ...authUserSelect,
        refreshTokens: {
          where: { familyId: payload.sid, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.municipalityId !== payload.mid ||
      user.refreshTokens.length === 0
    ) {
      return null;
    }

    return {
      id: user.id,
      municipalityId: user.municipalityId,
      departmentId: user.departmentId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: effectiveRoles(user).map((role) => role.code),
      permissions: new Set(effectivePermissions(user)),
      sessionId: payload.sid,
    };
  }

  async profile(userId: string): Promise<AuthUserProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: authUserSelect,
    });
    return toAuthUserProfile(user);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async createRefreshToken(
    db: Db,
    userId: string,
    familyId: string,
    meta: RequestMeta,
  ): Promise<{ id: string; raw: string; expiresAt: Date }> {
    const raw = this.tokens.generateRefreshToken();
    const expiresAt = this.tokens.refreshExpiry();
    const { id } = await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: this.tokens.hashRefreshToken(raw),
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      select: { id: true },
    });
    return { id, raw, expiresAt };
  }

  private async revokeFamily(familyId: string, now: Date, db: Db = this.prisma): Promise<number> {
    const { count } = await db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  private async buildSession(
    userId: string,
    familyId: string,
    refresh: { raw: string; expiresAt: Date },
  ): Promise<IssuedSession> {
    const user = await this.profile(userId);
    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      mid: user.municipality.id,
      sid: familyId,
      roles: user.roles.map((role) => role.code),
    });
    return {
      response: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.tokens.accessTtlSeconds,
        user,
      },
      refreshToken: refresh.raw,
      refreshExpiresAt: refresh.expiresAt,
    };
  }
}
