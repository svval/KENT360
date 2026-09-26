import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, RecordStatus, SLA_MAX_MINUTES } from '@kent360/shared-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';

const STATUSES = Object.values(RecordStatus);
const PRIORITIES = Object.values(Priority);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
/** Keywords feed the rule-based classifier (Phase 11): lower-cased (Turkish), trimmed, unique. */
const normaliseKeywords = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.map((k) => (typeof k === 'string' ? k.trim().toLocaleLowerCase('tr-TR') : k)),
        ),
      ].filter((k) => k !== '')
    : value;

const notNullish = (_: object, value: unknown) => value !== null && value !== undefined;

export const CATEGORY_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,59}$/;

export class ListCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Ad veya kod içinde arama' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: RecordStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Bu ana kategorinin alt kategorileri' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CategoryTreeQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, description: 'Boş: tümü' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: RecordStatus;
}

class CategoryAttributesDto {
  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @ValidateIf(notNullish)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'construction', description: 'Lucide ikon adı' })
  @Transform(emptyToNull)
  @ValidateIf(notNullish)
  @Matches(/^[a-z0-9-]{1,60}$/, { message: 'İkon adı küçük harf, rakam ve "-" içermeli.' })
  icon?: string | null;

  @ApiPropertyOptional({ enum: PRIORITIES, default: Priority.NORMAL })
  @IsOptional()
  @IsIn(PRIORITIES)
  defaultPriority?: Priority;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 1,
    maximum: SLA_MAX_MINUTES,
    example: 1440,
    description: 'Dakika. null: ana kategoriden miras',
  })
  @ValidateIf(notNullish)
  @IsInt({ message: 'SLA dakika cinsinden tam sayı olmalı.' })
  @Min(1, { message: 'SLA en az 1 dakika olmalı.' })
  @Max(SLA_MAX_MINUTES, { message: `SLA en fazla ${SLA_MAX_MINUTES} dakika (365 gün) olabilir.` })
  defaultSlaMinutes?: number | null;

  @ApiPropertyOptional({ type: [String], example: ['çukur', 'asfalt'] })
  @IsOptional()
  @Transform(normaliseKeywords)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  keywords?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class CreateCategoryDto extends CategoryAttributesDto {
  @ApiProperty({ example: 'Yol Çukuru' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'ROAD_POTHOLE',
    description: 'Belediye içinde tekil, sonradan değiştirilemez',
  })
  @Transform(trim)
  @Matches(CATEGORY_CODE_PATTERN, {
    message: 'Kod BÜYÜK_HARF, rakam ve alt çizgiden oluşmalı (ör. ROAD_POTHOLE).',
  })
  code!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Boş: ana kategori' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Alt kategoride zorunlu (yönlendirme)' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class UpdateCategoryDto extends CategoryAttributesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null: ana kategori yap' })
  @ValidateIf(notNullish)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf(notNullish)
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({ enum: STATUSES, description: 'Silme yerine pasifleştirme' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: RecordStatus;
}
