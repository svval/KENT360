import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated, Permission, type UserSummary } from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions, ReqMeta } from '../../common/decorators/auth.decorators';
import { type RequestMeta } from '../../common/utils/request-meta';
import { CreateUserDto, ListUsersQueryDto, SetUserRolesDto, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions(Permission.USERS_READ)
  @ApiOperation({ summary: 'Belediyenin kullanıcıları (sayfalı)' })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListUsersQueryDto,
  ): Promise<Paginated<UserSummary>> {
    return this.users.list(actor, query);
  }

  @Get(':id')
  @Permissions(Permission.USERS_READ)
  get(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<UserSummary> {
    return this.users.get(actor, id);
  }

  @Post()
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Kullanıcı oluşturur (audit: USER_CREATED)' })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateUserDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<UserSummary> {
    return this.users.create(actor, dto, meta);
  }

  @Patch(':id')
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Profil / durum günceller (audit: USER_UPDATED, USER_STATUS_CHANGED)' })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<UserSummary> {
    return this.users.update(actor, id, dto, meta);
  }

  @Put(':id/roles')
  @Permissions(Permission.ROLES_MANAGE)
  @ApiOperation({ summary: 'Kullanıcının rollerini belirler (audit: USER_ROLE_CHANGED)' })
  setRoles(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetUserRolesDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<UserSummary> {
    return this.users.setRoles(actor, id, dto, meta);
  }
}
