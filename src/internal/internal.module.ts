import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
import { DispatchRemindersController } from './dispatch-reminders.controller';
import { DispatchRemindersService } from './dispatch-reminders.service';

@Module({
  imports: [PushModule, NotificationsModule],
  controllers: [DispatchRemindersController],
  providers: [DispatchRemindersService],
})
export class InternalModule {}
