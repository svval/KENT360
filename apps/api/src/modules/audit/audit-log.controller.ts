import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuditLogItem, type Paginated, Permission } from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions } from '../../common/decorators/auth.decorators';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto } from './dto/audit-log.dto';

@ApiTags('Audit')
@ApiBearerAuth('access-token')
@Controller('audit')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @Permissions(Permission.AUDIT_READ)
  @ApiOperation({
    summary: 'Denetim kaydı (yeniden eskiye, sayfalı) – kendi belediyesi',
    description:
      'Değişiklikler okunabilir alan/değer listesi olarak döner; parola, token, çerez, başlık, ' +
      'tam metin gövde ve tarayıcı bilgisi hiçbir zaman dönmez.',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<Paginated<AuditLogItem>> {
    return this.auditLog.list(actor, query);
  }
}
