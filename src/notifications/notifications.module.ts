import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { RecurringsModule } from '../recurrings/recurrings.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PushModule, RecurringsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
