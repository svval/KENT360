import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction, AUDIT_ENTITY_TYPES } from '@kent360/shared-types';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Kullanıcı adı veya e-posta içinde arama' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  user?: string;

  @ApiPropertyOptional({ enum: Object.values(AuditAction) })
  @IsOptional()
  @IsIn(Object.values(AuditAction))
  action?: string;

  @ApiPropertyOptional({ enum: AUDIT_ENTITY_TYPES })
  @IsOptional()
  @IsIn([...AUDIT_ENTITY_TYPES])
  entityType?: string;

  @ApiPropertyOptional({ description: 'Kayıt kimliği (tam eşleşme)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(DAY)
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-04' })
  @IsOptional()
  @Matches(DAY)
  dateTo?: string;
}
