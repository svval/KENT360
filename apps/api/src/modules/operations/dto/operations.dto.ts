import { ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, RequestStatus, WorkOrderStatus } from '@kent360/shared-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { parseBbox } from '../domain/bbox';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toList = ({ value }: { value: unknown }) =>
  value === undefined
    ? undefined
    : (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(',')).filter(Boolean);
const toBool = ({ value }: { value: unknown }) => value === true || value === 'true';

@ValidatorConstraint({ name: 'bbox' })
class BboxConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && parseBbox(value) !== null;
  }
  defaultMessage(): string {
    return 'bbox "batı,güney,doğu,kuzey" biçiminde geçerli bir koordinat kutusu olmalı.';
  }
}

class MapQueryDto {
  @ApiPropertyOptional({
    example: '37.30,37.00,37.45,37.10',
    description: 'Görünür alan: batı,güney,doğu,kuzey (WGS84). Verilmezse tüm kapsam.',
  })
  @IsOptional()
  @Validate(BboxConstraint)
  bbox?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: Object.values(Priority), isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(Object.values(Priority), { each: true })
  priority?: Priority[];

  @ApiPropertyOptional({ description: 'true: yalnız açık kayıtlar' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  open?: boolean;
}

export class MapRequestsQueryDto extends MapQueryDto {
  @ApiPropertyOptional({ enum: Object.values(RequestStatus), isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(Object.values(RequestStatus), { each: true })
  status?: RequestStatus[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Alt kategori veya ana kategori' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdTo?: string;
}

export class MapWorkOrdersQueryDto extends MapQueryDto {
  @ApiPropertyOptional({ enum: Object.values(WorkOrderStatus), isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(Object.values(WorkOrderStatus), { each: true })
  status?: WorkOrderStatus[];
}

export class SearchQueryDto {
  @ApiPropertyOptional({ description: 'En az 2 karakter: WO-/KNT- numarası, açıklama, adres' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Arama için en az 2 karakter girin.' })
  @MaxLength(100)
  q!: string;
}
