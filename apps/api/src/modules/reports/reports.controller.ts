import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  Permission,
  REPORT_TYPES,
  type ReportSummary,
  type ReportType,
} from '@kent360/shared-types';
import { type Response } from 'express';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions } from '../../common/decorators/auth.decorators';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ReportFiltersDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @Permissions(Permission.REPORTS_EXPORT, Permission.REQUESTS_READ)
  @ApiOperation({
    summary: 'Rapor özeti: toplam / çözülen / SLA / ortalama çözüm, müdürlük ve mahalle tabloları',
    description:
      'Kapsam: yönetici belediye, müdürlük yöneticisi kendi müdürlüğü. Vatandaş ve saha personeli 403.',
  })
  summary(
    @CurrentUser() actor: AuthUser,
    @Query() filters: ReportFiltersDto,
  ): Promise<ReportSummary> {
    return this.reports.summary(actor, filters);
  }

  @Get(':file')
  @RawResponse()
  @Permissions(Permission.REPORTS_EXPORT, Permission.REQUESTS_READ)
  @Throttle({ default: { limit: 120, ttl: 3_600_000 } })
  @ApiParam({ name: 'file', enum: REPORT_TYPES.map((type) => `${type}.csv`) })
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'CSV dışa aktarma (UTF-8 BOM, ";" ayraç, formül enjeksiyonuna karşı korumalı)',
    description: `Dosyalar: ${REPORT_TYPES.map((type) => `${type}.csv`).join(', ')}. Satır sınırı 10 000.`,
  })
  async csv(
    @CurrentUser() actor: AuthUser,
    @Param('file') file: string,
    @Query() filters: ReportFiltersDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const type = file.endsWith('.csv') ? file.slice(0, -4) : '';
    if (!(REPORT_TYPES as readonly string[]).includes(type)) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Rapor bulunamadı.');
    }
    const { filename, body } = await this.reports.csv(actor, type as ReportType, filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return body;
  }
}
