import { ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, RequestStatus } from '@kent360/shared-types';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Report filters; dates are local calendar days, the range is inclusive (default: last 30 days). */
export class ReportFiltersDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(DAY, { message: 'dateFrom YYYY-AA-GG biçiminde olmalı.' })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(DAY, { message: 'dateTo YYYY-AA-GG biçiminde olmalı.' })
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Ana kategori seçilirse alt kategorileri de kapsar' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: Object.values(RequestStatus) })
  @IsOptional()
  @IsIn(Object.values(RequestStatus))
  status?: string;

  @ApiPropertyOptional({ enum: Object.values(Priority) })
  @IsOptional()
  @IsIn(Object.values(Priority))
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  neighborhoodId?: string;
}
