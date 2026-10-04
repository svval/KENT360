import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type DashboardOverview,
  MAP_FEATURE_LIMIT,
  type MapFeatureCollection,
  type MapRequestProperties,
  type MapWorkOrderProperties,
  type NeighborhoodPulse,
  type NeighborhoodPulseDetail,
  type PulseAnomaly,
  Permission,
  type SearchResultItem,
} from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions, PermissionsAny } from '../../common/decorators/auth.decorators';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { DashboardService } from './dashboard.service';
import { MapRequestsQueryDto, MapWorkOrdersQueryDto, SearchQueryDto } from './dto/operations.dto';
import { MapService } from './map.service';
import { PulseService } from './pulse.service';
import { SearchService } from './search.service';

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly pulse: PulseService) {}

  @Get('neighborhoods')
  @Permissions(Permission.ANALYTICS_READ, Permission.REQUESTS_READ)
  @ApiOperation({
    summary: 'MahallePulse: mahalle metrikleri ve açıklanabilir risk skoru (risk sırasına göre)',
    description:
      'Kapsam: yönetici belediye, müdürlük yöneticisi kendi müdürlüğü. Risk skoru kural tabanlıdır ' +
      '(açık yoğunluk, SLA aşımı, kritik oran, artış, çözüm süresi) – riskFactors her bileşeni açıklar.',
  })
  neighborhoods(@CurrentUser() actor: AuthUser): Promise<NeighborhoodPulse[]> {
    return this.pulse.list(actor);
  }

  @Get('neighborhoods/:id')
  @Permissions(Permission.ANALYTICS_READ, Permission.REQUESTS_READ)
  @ApiOperation({
    summary:
      'Mahalle detayı: KPI, kategori dağılımı, 90 günlük trend, açık talepler, iş emirleri, anomaliler',
  })
  neighborhood(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NeighborhoodPulseDetail> {
    return this.pulse.detail(actor, id);
  }

  @Get('anomalies')
  @Permissions(Permission.ANALYTICS_READ, Permission.REQUESTS_READ)
  @ApiOperation({
    summary: 'Kural tabanlı anomaliler: son 7 gün / önceki 4 haftanın haftalık ortalaması',
    description:
      'En az 3 bildirim, ortalamanın en az 1,5 katı ve en az 2 fazla olmadan anomali üretilmez.',
  })
  anomalies(@CurrentUser() actor: AuthUser): Promise<PulseAnomaly[]> {
    return this.pulse.anomalies(actor);
  }
}

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @Permissions(Permission.REQUESTS_READ)
  @ApiOperation({
    summary: 'Operasyon paneli: KPI, 30 günlük trend, kritik ve son talepler',
    description:
      'Kullanıcının kapsamıyla daraltılır (yönetici: belediye, müdürlük: kendi müdürlüğü). ' +
      'Vatandaş ve saha personeli erişemez (403).',
  })
  overview(@CurrentUser() actor: AuthUser): Promise<DashboardOverview> {
    return this.dashboard.overview(actor);
  }
}

@ApiTags('Map')
@ApiBearerAuth('access-token')
@Controller('map')
@RawResponse()
export class MapController {
  constructor(private readonly map: MapService) {}

  @Get('requests')
  @Permissions(Permission.REQUESTS_READ)
  @ApiOperation({
    summary: 'Talepler – GeoJSON FeatureCollection (zarfsız), bbox ile görünür alan',
    description: `En yeni ${MAP_FEATURE_LIMIT} kayıt; fazlası varsa "truncated": true.`,
  })
  requests(
    @CurrentUser() actor: AuthUser,
    @Query() query: MapRequestsQueryDto,
  ): Promise<MapFeatureCollection<MapRequestProperties>> {
    return this.map.requests(actor, query);
  }

  @Get('work-orders')
  @PermissionsAny(Permission.WORK_ORDERS_READ, Permission.WORK_ORDERS_READ_ASSIGNED)
  @ApiOperation({
    summary:
      'İş emirleri – GeoJSON FeatureCollection (zarfsız); saha personeli yalnız kendi işleri',
  })
  workOrders(
    @CurrentUser() actor: AuthUser,
    @Query() query: MapWorkOrdersQueryDto,
  ): Promise<MapFeatureCollection<MapWorkOrderProperties>> {
    return this.map.workOrdersLayer(actor, query);
  }
}

@ApiTags('Search')
@ApiBearerAuth('access-token')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @PermissionsAny(
    Permission.REQUESTS_READ,
    Permission.REQUESTS_READ_OWN,
    Permission.WORK_ORDERS_READ,
    Permission.WORK_ORDERS_READ_ASSIGNED,
  )
  @ApiOperation({
    summary: 'Genel arama: talep ve iş emri (numara, açıklama, adres) – kullanıcının kapsamında',
  })
  search(
    @CurrentUser() actor: AuthUser,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultItem[]> {
    return this.searchService.search(actor, query.q);
  }
}
