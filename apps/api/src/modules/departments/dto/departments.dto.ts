import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecordStatus } from '@kent360/shared-types';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';

const STATUSES = Object.values(RecordStatus);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

export const DEPARTMENT_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;

export class ListDepartmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Ad veya kod içinde arama' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: RecordStatus;
}

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Fen İşleri Müdürlüğü' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({
    example: 'PUBLIC_WORKS',
    description: 'Makine dostu, belediye içinde tekil ve sonradan değiştirilemez',
  })
  @Transform(trim)
  @Matches(DEPARTMENT_CODE_PATTERN, {
    message: 'Kod BÜYÜK_HARF, rakam ve alt çizgiden oluşmalı (ör. PUBLIC_WORKS).',
  })
  code!: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @MaxLength(160)
  contactEmail?: string | null;
}

/** `code` is immutable: categories, seeds and integrations refer to it. */
export class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @MaxLength(160)
  contactEmail?: string | null;

  @ApiPropertyOptional({ enum: STATUSES, description: 'Silme yerine pasifleştirme' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: RecordStatus;
}
