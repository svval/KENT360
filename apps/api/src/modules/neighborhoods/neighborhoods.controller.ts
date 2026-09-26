import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type NeighborhoodDetail,
  type NeighborhoodImportResult,
  type NeighborhoodResolution,
  type NeighborhoodSummary,
  type Paginated,
  Permission,
} from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions, ReqMeta } from '../../common/decorators/auth.decorators';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { type RequestMeta } from '../../common/utils/request-meta';
import {
  CreateNeighborhoodDto,
  ImportNeighborhoodsDto,
  ImportQueryDto,
  ListNeighborhoodsQueryDto,
  ResolveNeighborhoodQueryDto,
  UpdateNeighborhoodDto,
} from './dto/neighborhoods.dto';
import { NeighborhoodsService } from './neighborhoods.service';

@ApiTags('Neighborhoods')
@ApiBearerAuth('access-token')
@Controller('neighborhoods')
export class NeighborhoodsController {
  constructor(private readonly neighborhoods: NeighborhoodsService) {}

  @Get()
  @Permissions(Permission.NEIGHBORHOODS_READ)
  @ApiOperation({ summary: 'Mahalleler (sayfalı; search, status, sort) + geometri özeti' })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListNeighborhoodsQueryDto,
  ): Promise<Paginated<NeighborhoodSummary>> {
    return this.neighborhoods.list(actor, query);
  }

  // Static paths are declared before ":id".
  @Get('geojson')
  @Permissions(Permission.NEIGHBORHOODS_READ)
  @RawResponse()
  @Header('Content-Type', 'application/geo+json; charset=utf-8')
  @ApiOperation({
    summary:
      "Aktif mahallelerin GeoJSON FeatureCollection'ı (harita kaynağı olarak doğrudan kullanılır)",
    description:
      "Zarf ({ success, data }) içermez: yanıt geçerli bir RFC 7946 FeatureCollection'dır. " +
      'Feature properties: id, name, code. Koordinatlar 6 ondalık basamak.',
  })
  @ApiOkResponse({ description: '{ "type": "FeatureCollection", "features": [...] }' })
  geojson(@CurrentUser() actor: AuthUser): Promise<string> {
    return this.neighborhoods.featureCollection(actor);
  }

  @Get('resolve')
  @Permissions(Permission.NEIGHBORHOODS_READ)
  @ApiOperation({
    summary: 'Koordinatın bulunduğu aktif mahalle (ST_Covers; sınır üzerindeki nokta da eşleşir)',
  })
  @ApiOkResponse({ description: '{ id, name, code } ya da hiçbir mahalleye düşmüyorsa null' })
  resolve(
    @CurrentUser() actor: AuthUser,
    @Query() query: ResolveNeighborhoodQueryDto,
  ): Promise<NeighborhoodResolution | null> {
    return this.neighborhoods.resolve(actor, query.lat, query.lng);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.NEIGHBORHOODS_MANAGE)
  @ApiOperation({
    summary:
      'GeoJSON FeatureCollection içe aktarır – ya hepsi ya hiçbiri (audit: NEIGHBORHOODS_IMPORTED)',
    description:
      'Her Feature: properties.name, properties.code (belediye içinde tekil), opsiyonel district/population; ' +
      'geometry Polygon | MultiPolygon, WGS84. Hatalı dosyada 400 NEIGHBORHOOD_IMPORT_FAILED ve ' +
      'details.errors[] (index, code, message) döner; hiçbir kayıt yazılmaz. ?dryRun=true yalnızca doğrular. ' +
      'Gövde sınırı 10 MB.',
  })
  import(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ImportNeighborhoodsDto,
    @Query() query: ImportQueryDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<NeighborhoodImportResult> {
    return this.neighborhoods.import(actor, dto, query.dryRun === true, meta);
  }

  @Get(':id')
  @Permissions(Permission.NEIGHBORHOODS_READ)
  @ApiOperation({ summary: 'Mahalle detayı + sınır geometrisi (GeoJSON MultiPolygon)' })
  get(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NeighborhoodDetail> {
    return this.neighborhoods.get(actor, id);
  }

  @Post()
  @Permissions(Permission.NEIGHBORHOODS_MANAGE)
  @ApiOperation({ summary: 'Mahalle oluşturur (audit: NEIGHBORHOOD_CREATED)' })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateNeighborhoodDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<NeighborhoodDetail> {
    return this.neighborhoods.create(actor, dto, meta);
  }

  @Patch(':id')
  @Permissions(Permission.NEIGHBORHOODS_MANAGE)
  @ApiOperation({
    summary:
      'Mahalle bilgisi / sınırı / durumu günceller (audit: NEIGHBORHOOD_UPDATED, NEIGHBORHOOD_STATUS_CHANGED)',
  })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateNeighborhoodDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<NeighborhoodDetail> {
    return this.neighborhoods.update(actor, id, dto, meta);
  }
}
