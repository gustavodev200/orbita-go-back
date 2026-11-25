import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { uuidParamSchema } from '../common/schemas/common.schema';
import {
  listNotificationsQuerySchema,
  type ListNotificationsQuery,
} from './dto/notification.schema';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listNotificationsQuerySchema))
    query: ListNotificationsQuery,
  ) {
    return this.notifications.list(user.id, query.filter);
  }

  /** Contador do sino (não lidas / urgentes). */
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.summary(user.id);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.refresh(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
  ) {
    return this.notifications.markRead(user.id, id);
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
  ) {
    return this.notifications.dismiss(user.id, id);
  }
}
