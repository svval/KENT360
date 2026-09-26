import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthSession,
  type AuthTokenResponse,
  type AuthUserProfile,
} from '@kent360/shared-types';
import { type Request, type Response } from 'express';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, ReqMeta } from '../../common/decorators/auth.decorators';
import { type RequestMeta } from '../../common/utils/request-meta';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { REFRESH_COOKIE, RefreshCookie } from './refresh-cookie';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: RefreshCookie,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // 5 attempts per minute per IP + e-mail (see AppThrottlerGuard); lockout after 10 failures.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'E-posta + şifre ile giriş; refresh token httpOnly cookie olarak döner',
  })
  @ApiOkResponse({ description: 'Access token + kullanıcı profili' })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED' })
  async login(
    @Body() dto: LoginDto,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const session = await this.auth.login(dto, meta);
    this.cookie.set(res, session.refreshToken, session.refreshExpiresAt);
    return session.response;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Refresh token rotation – eski token iptal edilir, yenisi cookie ile döner',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_REFRESH_TOKEN (yeniden kullanımda oturum iptal edilir)',
  })
  async refresh(
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    try {
      const session = await this.auth.refresh(this.cookie.read(req), meta);
      this.cookie.set(res, session.refreshToken, session.refreshExpiresAt);
      return session.response;
    } catch (error) {
      this.cookie.clear(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ summary: 'Mevcut oturumu (token ailesini) sonlandırır' })
  async logout(
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    await this.auth.logout(this.cookie.read(req), meta);
    this.cookie.clear(res);
    return null;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Kullanıcının tüm cihazlardaki oturumlarını sonlandırır' })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ revokedSessions: number }> {
    const result = await this.auth.logoutAll(user, meta);
    this.cookie.clear(res);
    return result;
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Oturumdaki kullanıcı, rolleri ve izinleri' })
  me(@CurrentUser() user: AuthUser): Promise<AuthUserProfile> {
    return this.auth.profile(user.id);
  }

  @Get('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Aktif oturumlar (cihazlar)' })
  sessions(@CurrentUser() user: AuthUser): Promise<AuthSession[]> {
    return this.auth.listSessions(user);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Bir oturumu sonlandırır' })
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    await this.auth.revokeSession(user, id, meta);
    if (id === user.sessionId) this.cookie.clear(res);
    return null;
  }
}
