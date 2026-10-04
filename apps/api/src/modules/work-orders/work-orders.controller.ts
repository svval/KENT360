import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type Paginated,
  Permission,
  WORK_ORDER_MEDIA_LIMITS,
  type WorkOrderDetail,
  type WorkOrderMediaItem,
  type WorkOrderSummary,
} from '@kent360/shared-types';
import { memoryStorage } from 'multer';
import { type AuthUser } from '../../common/auth/auth-user';
import {
  CurrentUser,
  Permissions,
  PermissionsAny,
  ReqMeta,
} from '../../common/decorators/auth.decorators';
import { type RequestMeta } from '../../common/utils/request-meta';
import { type UploadedFile } from '../storage/image-upload.service';
import {
  AssignWorkOrderDto,
  CreateWorkOrderDto,
  ListWorkOrdersQueryDto,
  TransitionWorkOrderDto,
  UploadWorkOrderMediaDto,
} from './dto/work-orders.dto';
import { WorkOrderMediaService } from './work-order-media.service';
import { WorkOrdersService } from './work-orders.service';

const uuid = new ParseUUIDPipe();
const READ = [Permission.WORK_ORDERS_READ, Permission.WORK_ORDERS_READ_ASSIGNED] as const;

@ApiTags('Work orders')
@ApiBearerAuth('access-token')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly media: WorkOrderMediaService,
  ) {}

  @Post()
  @Permissions(Permission.WORK_ORDERS_CREATE)
  @ApiOperation({
    summary: 'Talepten iş emri oluşturur (audit: WORK_ORDER_CREATED); talep → WORK_ORDER_CREATED',
    description:
      'Talep ASSIGNED_TO_DEPARTMENT olmalı; numara (WO-YYYY-NNNNNN), müdürlük, öncelik, SLA ve konum ' +
      'talepten kopyalanır. Aktif iş emri varsa 409 WORK_ORDER_ALREADY_EXISTS.',
  })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateWorkOrderDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.create(actor, dto, meta);
  }

  @Get()
  @PermissionsAny(...READ)
  @ApiOperation({
    summary: 'İş emirleri (sayfalı) – kullanıcının kapsamına göre otomatik daraltılır',
    description:
      'Yönetici: belediyenin tümü · müdürlük yöneticisi: kendi müdürlüğü · ekip sorumlusu / saha ' +
      'personeli: kendisine veya ekibine atananlar. Filtreler kapsamın içinde uygulanır.',
  })
  async list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListWorkOrdersQueryDto,
  ): Promise<Paginated<WorkOrderSummary>> {
    return this.workOrders.list(await this.workOrders.context(actor), query);
  }

  @Get(':id')
  @PermissionsAny(...READ)
  @ApiOperation({
    summary: 'İş emri detayı: kaynak talep, önce/sonra fotoğrafları, atamalar, zaman çizelgesi',
  })
  async get(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.get(await this.workOrders.context(actor), id);
  }

  @Post(':id/assignment')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.WORK_ORDERS_ASSIGN)
  @ApiOperation({
    summary: 'Ekip ve/veya personel atar (audit: WORK_ORDER_ASSIGNED / WORK_ORDER_REASSIGNED)',
    description:
      'Eski atama geçmişte kalır. CREATED → ASSIGNED; kabul edilmiş iş yeniden atanınca ASSIGNED; ' +
      'WAITING korunur. Sahadaki iş (EN_ROUTE, ON_SITE, IN_PROGRESS) yeniden atanamaz.',
  })
  async assign(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AssignWorkOrderDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.assign(await this.workOrders.context(actor), id, dto, meta);
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @PermissionsAny(
    Permission.WORK_ORDERS_EXECUTE,
    Permission.WORK_ORDERS_COMPLETE,
    Permission.WORK_ORDERS_VERIFY,
    Permission.WORK_ORDERS_CREATE,
  )
  @ApiOperation({
    summary: 'Durum geçişi (audit: WORK_ORDER_STATUS_CHANGED / COMPLETED / VERIFIED / CANCELLED)',
    description:
      'Geçersiz → 409 INVALID_STATUS_TRANSITION { from, to, allowed }; bayat → 409 WORK_ORDER_STALE. ' +
      'ON_SITE / IN_PROGRESS: konum zorunlu, yarıçap dışı → 409 FIELD_LOCATION_TOO_FAR. ' +
      'COMPLETED: completionDescription ve en az bir AFTER fotoğrafı.',
  })
  async transition(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: TransitionWorkOrderDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.transition(await this.workOrders.context(actor), id, dto, meta);
  }

  @Post(':id/media')
  @Permissions(Permission.WORK_ORDERS_EXECUTE)
  @Throttle({ default: { limit: 120, ttl: 3_600_000 } })
  @UseInterceptors(
    FilesInterceptor('files', WORK_ORDER_MEDIA_LIMITS.maxPerType, {
      storage: memoryStorage(),
      // Oversized files are cut off by multer (413) before reaching the service.
      limits: {
        fileSize: WORK_ORDER_MEDIA_LIMITS.maxBytes,
        files: WORK_ORDER_MEDIA_LIMITS.maxPerType,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadWorkOrderMediaDto })
  @ApiOperation({
    summary:
      'Kanıt fotoğrafı yükler: type = BEFORE | DURING | AFTER (audit: WORK_ORDER_MEDIA_ADDED)',
    description:
      'Talep fotoğraflarıyla aynı hat: imza, çözme, meta veri temizliği, private bucket. ' +
      'Tür başına ≤ 5 fotoğraf; yalnız işi yürüten personel ve iş sürerken.',
  })
  async uploadMedia(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: UploadWorkOrderMediaDto,
    @UploadedFiles() files: UploadedFile[] | undefined,
    @ReqMeta() meta: RequestMeta,
  ): Promise<WorkOrderMediaItem[]> {
    return this.media.upload(await this.workOrders.context(actor), id, dto.type, files ?? [], meta);
  }

  @Get(':id/media/:mediaId/url')
  @PermissionsAny(...READ)
  @ApiOperation({ summary: 'Fotoğraf için yeni kısa ömürlü (presigned) URL' })
  async mediaUrl(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('mediaId', uuid) mediaId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    return this.media.url(await this.workOrders.context(actor), id, mediaId);
  }
}
