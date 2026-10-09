import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type NotificationItem, type NotificationListMeta } from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { ListNotificationsQueryDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/** The caller's own inbox – no permission beyond a session; ownership is the rule. */
@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Kendi bildirimlerim (yeniden eskiye, sayfalı); meta.unreadCount okunmamış sayısı',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<{ items: NotificationItem[]; meta: NotificationListMeta }> {
    return this.notifications.list(actor, query);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Bildirimi okundu işaretle (başkasının bildirimi → 404)' })
  markRead(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NotificationItem> {
    return this.notifications.markRead(actor, id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tüm bildirimlerimi okundu işaretle' })
  markAllRead(@CurrentUser() actor: AuthUser): Promise<{ updated: number }> {
    return this.notifications.markAllRead(actor);
  }
}
