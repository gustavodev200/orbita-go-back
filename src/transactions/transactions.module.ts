import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { RecurringsModule } from '../recurrings/recurrings.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [AccountsModule, RecurringsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
