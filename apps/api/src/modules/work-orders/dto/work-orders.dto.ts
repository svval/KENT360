import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, WorkOrderMediaType, WorkOrderStatus } from '@kent360/shared-types';
import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';

const STATUSES = Object.values(WorkOrderStatus);
const PRIORITIES = Object.values(Priority);
const MEDIA_TYPES = Object.values(WorkOrderMediaType);

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** `?status=A&status=B` or `?status=A,B`. */
const toList = ({ value }: { value: unknown }) =>
  value === undefined
    ? undefined
    : (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(',')).filter(Boolean);

/**
 * Everything else – number, department, priority, SLA, location snapshot, status – comes
 * from the source request on the server; extra fields are rejected (forbidNonWhitelisted).
 */
export class CreateWorkOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Müdürlüğe atanmış (ASSIGNED_TO_DEPARTMENT) talep' })
  @IsUUID()
  requestId!: string;

  @ApiPropertyOptional({
    description: 'Saha ekibi için talimat',
    example: 'Asfalt yaması yapılacak.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}

export class ListWorkOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'İş emri no / talep no (tam veya parça), talep açıklaması veya adres',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: STATUSES, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(STATUSES, { each: true })
  status?: WorkOrderStatus[];

  @ApiPropertyOptional({ enum: PRIORITIES, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(PRIORITIES, { each: true })
  priority?: Priority[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  fieldTeamId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  neighborhoodId?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30T23:59:59Z' })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;
}

/** Team and/or person; at least one. A person given with a team must be a member of it. */
export class AssignWorkOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  fieldTeamId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class TransitionWorkOrderDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  to!: WorkOrderStatus;

  @ApiPropertyOptional({
    enum: STATUSES,
    description: 'İstemcinin gördüğü durum; farklıysa 409 WORK_ORDER_STALE (bayat ekran)',
  })
  @IsOptional()
  @IsIn(STATUSES)
  from?: WorkOrderStatus;

  @ApiPropertyOptional({ description: 'Beklemeye alma, geri gönderme ve iptalde zorunlu' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'COMPLETED için zorunlu: yapılan işin açıklaması' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  completionDescription?: string;

  @ApiPropertyOptional({ description: 'Cihaz konumu – ON_SITE ve IN_PROGRESS geçişlerinde' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;
}

/** Multipart: `type` field + files in "files". */
export class UploadWorkOrderMediaDto {
  @ApiProperty({ enum: MEDIA_TYPES })
  @IsIn(MEDIA_TYPES)
  type!: WorkOrderMediaType;

  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  @IsOptional()
  files?: unknown[];
}
