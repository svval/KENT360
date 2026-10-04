import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, RequestSource, RequestStatus, SlaStatus } from '@kent360/shared-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';

const STATUSES = Object.values(RequestStatus);
const PRIORITIES = Object.values(Priority);
const SOURCES = Object.values(RequestSource);
const SLA_STATUSES = Object.values(SlaStatus);

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
/** `?status=NEW&status=UNDER_REVIEW` or `?status=NEW,UNDER_REVIEW`. */
const toList = ({ value }: { value: unknown }) =>
  value === undefined
    ? undefined
    : (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(',')).filter(Boolean);

/**
 * What a reporter sends. Everything else – municipality, department, neighbourhood,
 * source, status, priority, SLA, public number, reporter – is decided by the server;
 * sending such a field is rejected (forbidNonWhitelisted) instead of silently ignored.
 */
export class CreateRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Aktif bir alt kategori (yaprak)' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 'Okul önündeki yolda büyük bir çukur var, araçlar sürekli çarpıyor.' })
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Açıklama en az 10 karakter olmalı.' })
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ minimum: -90, maximum: 90, example: 37.0585 })
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Enlem sayı olmalı.' })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180, example: 37.371 })
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Boylam sayı olmalı.' })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ nullable: true, example: 'Karataş Mh. 12. Sk. No: 4 önü' })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(500)
  address?: string | null;
}

/** Preview analysis – the same fields a reporter fills in; nothing is stored. */
export class AnalyzeRequestDto {
  @ApiProperty({ example: 'Okul önündeki yolda büyük bir çukur var.' })
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Analiz için açıklama en az 10 karakter olmalı.' })
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Seçilmiş kategori (benzerlik skoru için)' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class ListRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Talep no (tam), açıklama veya adres içinde arama' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: STATUSES, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(STATUSES, { each: true })
  status?: RequestStatus[];

  @ApiPropertyOptional({ enum: PRIORITIES, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(PRIORITIES, { each: true })
  priority?: Priority[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Alt kategori veya ana kategori (alt kategorileriyle)',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  neighborhoodId?: string;

  @ApiPropertyOptional({ enum: SOURCES })
  @IsOptional()
  @IsIn(SOURCES)
  source?: RequestSource;

  @ApiPropertyOptional({ enum: SLA_STATUSES })
  @IsOptional()
  @IsIn(SLA_STATUSES)
  slaStatus?: SlaStatus;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30T23:59:59Z' })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'true: yalnızca benim oluşturduklarım' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
}

export class TransitionRequestDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  to!: RequestStatus;

  @ApiPropertyOptional({ description: 'Reddetme ve geri almada zorunlu' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ChangePriorityDto {
  @ApiProperty({ enum: PRIORITIES })
  @IsIn(PRIORITIES)
  priority!: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ChangeDepartmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  departmentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Multipart upload: files in the "files" field (for Swagger). */
export class UploadMediaDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  files!: unknown[];
}
