import { Module } from '@nestjs/common';
import { DispatchRemindersController } from './dispatch-reminders.controller';
import { DispatchRemindersService } from './dispatch-reminders.service';

@Module({
  controllers: [DispatchRemindersController],
  providers: [DispatchRemindersService],
})
export class InternalModule {}
