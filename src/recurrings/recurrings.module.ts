import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { RecurringsController } from './recurrings.controller';
import { RecurringsService } from './recurrings.service';

@Module({
  imports: [AccountsModule],
  controllers: [RecurringsController],
  providers: [RecurringsService],
  exports: [RecurringsService],
})
export class RecurringsModule {}
