import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Paginated,
  Permission,
  type RequestCategoryNode,
  type RequestCategorySummary,
} from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions, ReqMeta } from '../../common/decorators/auth.decorators';
import { type RequestMeta } from '../../common/utils/request-meta';
import {
  CategoryTreeQueryDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto/request-categories.dto';
import { RequestCategoriesService } from './request-categories.service';

@ApiTags('Request categories')
@ApiBearerAuth('access-token')
@Controller('request-categories')
export class RequestCategoriesController {
  constructor(private readonly categories: RequestCategoriesService) {}

  @Get()
  @Permissions(Permission.CATEGORIES_READ)
  @ApiOperation({
    summary: 'Kategoriler, düz liste (sayfalı; search, status, departmentId, parentId)',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<Paginated<RequestCategorySummary>> {
    return this.categories.list(actor, query);
  }

  @Get('tree')
  @Permissions(Permission.CATEGORIES_READ)
  @ApiOperation({ summary: 'Kategori ağacı (ana kategori → alt kategoriler), tek istek' })
  tree(
    @CurrentUser() actor: AuthUser,
    @Query() query: CategoryTreeQueryDto,
  ): Promise<RequestCategoryNode[]> {
    return this.categories.tree(actor, query);
  }

  @Get(':id')
  @Permissions(Permission.CATEGORIES_READ)
  get(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RequestCategorySummary> {
    return this.categories.get(actor, id);
  }

  @Post()
  @Permissions(Permission.CATEGORIES_MANAGE)
  @ApiOperation({ summary: 'Kategori oluşturur (audit: CATEGORY_CREATED)' })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateCategoryDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RequestCategorySummary> {
    return this.categories.create(actor, dto, meta);
  }

  @Patch(':id')
  @Permissions(Permission.CATEGORIES_MANAGE)
  @ApiOperation({
    summary:
      'Kategoriyi günceller / pasifleştirir (audit: CATEGORY_UPDATED, CATEGORY_STATUS_CHANGED). ' +
      'Ana kategori pasifleşince alt kategorileri de pasifleşir.',
  })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RequestCategorySummary> {
    return this.categories.update(actor, id, dto, meta);
  }
}
