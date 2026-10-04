import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
  REQUEST_MEDIA_LIMITS,
  type RequestDetail,
  type RequestAnalysisResult,
  type RequestMediaItem,
  type RequestSummary,
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
import { RequestAnalysisService } from '../ai/request-analysis.service';
import {
  AnalyzeRequestDto,
  ChangeDepartmentDto,
  ChangePriorityDto,
  CreateRequestDto,
  ListRequestsQueryDto,
  TransitionRequestDto,
  UploadMediaDto,
} from './dto/requests.dto';
import { RequestMediaService, type UploadedFile } from './request-media.service';
import { RequestsService } from './requests.service';

const uuid = new ParseUUIDPipe();

@ApiTags('Requests')
@ApiBearerAuth('access-token')
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly media: RequestMediaService,
    private readonly analysis: RequestAnalysisService,
  ) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.REQUESTS_CREATE)
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Kaydetmeden AI önerisi + benzer bildirimler (hiçbir şey saklanmaz)',
    description:
      'Öneri: kategori, müdürlük, öncelik, güven, kısa gerekçe. Benzer bildirimler: 150 m, son 30 gün, ' +
      'PostGIS mesafe + pg_trgm metin + kategori + zaman skoru (≥ 0,60 POSSIBLE_DUPLICATE). ' +
      'Sağlayıcıya yalnız kişisel veriden arındırılmış açıklama gider.',
  })
  analyze(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AnalyzeRequestDto,
  ): Promise<RequestAnalysisResult> {
    return this.analysis.preview(actor, dto);
  }

  @Post()
  @Permissions(Permission.REQUESTS_CREATE)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Talep oluşturur (audit: REQUEST_CREATED)',
    description:
      'Müdürlük, öncelik, SLA, mahalle, kaynak, durum ve talep numarası sunucuda belirlenir. ' +
      'Konum hiçbir aktif mahalleye düşmüyorsa talep yine oluşturulur; locationNotice döner.',
  })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateRequestDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RequestDetail> {
    return this.requests.create(actor, dto, meta);
  }

  @Get()
  @PermissionsAny(Permission.REQUESTS_READ, Permission.REQUESTS_READ_OWN)
  @ApiOperation({
    summary: 'Talepler (sayfalı) – kullanıcının kapsamına göre otomatik daraltılır',
    description:
      'Sistem yöneticisi: belediyenin tüm talepleri · personel: kendi müdürlüğü · vatandaş: kendi talepleri. ' +
      'Filtreler kapsamın içinde uygulanır; kapsam dışına çıkılamaz.',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListRequestsQueryDto,
  ): Promise<Paginated<RequestSummary>> {
    return this.requests.list(actor, query);
  }

  @Get(':id')
  @PermissionsAny(Permission.REQUESTS_READ, Permission.REQUESTS_READ_OWN)
  @ApiOperation({
    summary: 'Talep detayı: medya (kısa ömürlü URL), zaman çizelgesi, olası aksiyonlar',
  })
  get(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string): Promise<RequestDetail> {
    return this.requests.get(actor, id);
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @PermissionsAny(Permission.REQUESTS_UPDATE, Permission.REQUESTS_ASSIGN)
  @ApiOperation({
    summary: 'Durum geçişi (audit: REQUEST_STATUS_CHANGED)',
    description: 'Geçersiz geçiş → 409 INVALID_STATUS_TRANSITION, details: { from, to, allowed }.',
  })
  transition(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: TransitionRequestDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RequestDetail> {
    return this.requests.transition(actor, id, dto, meta);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.REQUESTS_CREATE)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Mevcut talebe katıl (audit: REQUEST_JOINED) – bir kez; kendi talebine değil',
  })
  join(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RequestDetail> {
    return this.requests.join(actor, id, meta);
  }

  @Patch(':id/priority')
  @Permissions(Permission.REQUESTS_UPDATE)
  @ApiOperation({ summary: 'Öncelik değiştirir (audit: REQUEST_PRIORITY_CHANGED)' })
  changePriority(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ChangePriorityDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RequestDetail> {
    return this.requests.changePriority(actor, id, dto, meta);
  }

  @Patch(':id/department')
  @Permissions(Permission.REQUESTS_ASSIGN)
  @ApiOperation({
    summary: 'Başka müdürlüğe yönlendirir (audit: REQUEST_DEPARTMENT_CHANGED); SLA değişmez',
  })
  changeDepartment(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ChangeDepartmentDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RequestDetail> {
    return this.requests.changeDepartment(actor, id, dto, meta);
  }

  @Post(':id/media')
  @PermissionsAny(Permission.REQUESTS_CREATE, Permission.REQUESTS_UPDATE)
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @UseInterceptors(
    FilesInterceptor('files', REQUEST_MEDIA_LIMITS.maxPerRequest, {
      storage: memoryStorage(),
      // Oversized files are cut off by multer (413) before reaching the service.
      limits: {
        fileSize: REQUEST_MEDIA_LIMITS.maxBytes,
        files: REQUEST_MEDIA_LIMITS.maxPerRequest,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadMediaDto })
  @ApiOperation({
    summary:
      'Fotoğraf yükler: JPEG / PNG / WEBP, ≤ 10 MB, talep başına ≤ 5 (audit: REQUEST_MEDIA_ADDED)',
    description:
      'Tür dosya imzasından (magic byte) belirlenir; dosya adı kullanılmaz. Bucket private.',
  })
  uploadMedia(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @UploadedFiles() files: UploadedFile[] | undefined,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RequestMediaItem[]> {
    return this.media.upload(actor, id, files ?? [], meta);
  }

  @Get(':id/media/:mediaId/url')
  @PermissionsAny(Permission.REQUESTS_READ, Permission.REQUESTS_READ_OWN)
  @ApiOperation({ summary: 'Fotoğraf için yeni kısa ömürlü (presigned) URL' })
  mediaUrl(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('mediaId', uuid) mediaId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    return this.media.url(actor, id, mediaId);
  }
}
