import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission, type PermissionSummary, type RoleSummary } from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions, ReqMeta } from '../../common/decorators/auth.decorators';
import { type RequestMeta } from '../../common/utils/request-meta';
import { CreateRoleDto, SetRolePermissionsDto } from './dto/roles.dto';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@ApiBearerAuth('access-token')
@Controller()
@Permissions(Permission.ROLES_MANAGE)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Sistem rolleri + belediyeye özel roller' })
  list(@CurrentUser() actor: AuthUser): Promise<RoleSummary[]> {
    return this.roles.list(actor);
  }

  @Post('roles')
  @ApiOperation({ summary: 'Belediyeye özel rol oluşturur (audit: ROLE_CREATED)' })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateRoleDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RoleSummary> {
    return this.roles.create(actor, dto, meta);
  }

  @Put('roles/:id/permissions')
  @ApiOperation({ summary: 'Rolün izinlerini belirler (audit: ROLE_PERMISSION_CHANGED)' })
  setPermissions(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetRolePermissionsDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RoleSummary> {
    return this.roles.setPermissions(actor, id, dto, meta);
  }

  @Get('permissions')
  @ApiOperation({ summary: 'İzin kataloğu' })
  permissions(): Promise<PermissionSummary[]> {
    return this.roles.listPermissions();
  }
}
