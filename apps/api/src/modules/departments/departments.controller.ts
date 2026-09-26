import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type DepartmentSummary, type Paginated, Permission } from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions, ReqMeta } from '../../common/decorators/auth.decorators';
import { type RequestMeta } from '../../common/utils/request-meta';
import { DepartmentsService } from './departments.service';
import {
  CreateDepartmentDto,
  ListDepartmentsQueryDto,
  UpdateDepartmentDto,
} from './dto/departments.dto';

@ApiTags('Departments')
@ApiBearerAuth('access-token')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @Permissions(Permission.DEPARTMENTS_READ)
  @ApiOperation({ summary: 'Müdürlükler (sayfalı; search, status, sort)' })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListDepartmentsQueryDto,
  ): Promise<Paginated<DepartmentSummary>> {
    return this.departments.list(actor, query);
  }

  @Get(':id')
  @Permissions(Permission.DEPARTMENTS_READ)
  get(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DepartmentSummary> {
    return this.departments.get(actor, id);
  }

  @Post()
  @Permissions(Permission.DEPARTMENTS_MANAGE)
  @ApiOperation({ summary: 'Müdürlük oluşturur (audit: DEPARTMENT_CREATED)' })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateDepartmentDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DepartmentSummary> {
    return this.departments.create(actor, dto, meta);
  }

  @Patch(':id')
  @Permissions(Permission.DEPARTMENTS_MANAGE)
  @ApiOperation({
    summary:
      'Müdürlüğü günceller / pasifleştirir (audit: DEPARTMENT_UPDATED, DEPARTMENT_STATUS_CHANGED)',
  })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDepartmentDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DepartmentSummary> {
    return this.departments.update(actor, id, dto, meta);
  }
}
