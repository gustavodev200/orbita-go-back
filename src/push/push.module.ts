import { Module } from '@nestjs/common';
import { PushSenderService } from './push-sender.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  controllers: [PushController],
  providers: [PushService, PushSenderService],
  exports: [PushSenderService],
})
export class PushModule {}
