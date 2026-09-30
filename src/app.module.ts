import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { BudgetsModule } from './budgets/budgets.module';
import { CategoriesModule } from './categories/categories.module';
import { validateEnv } from './common/config/env.schema';
import { GamificationModule } from './gamification/gamification.module';
import { GoalsModule } from './goals/goals.module';
import { HealthController } from './health/health.controller';
import { InternalModule } from './internal/internal.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma/prisma.module';
import { PushModule } from './push/push.module';
import { RecurringsModule } from './recurrings/recurrings.module';
import { RemindersModule } from './reminders/reminders.module';
import { TasksModule } from './tasks/tasks.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    GamificationModule,
    AuthModule,
    UsersModule,
    OnboardingModule,
    CategoriesModule,
    AccountsModule,
    TransactionsModule,
    RecurringsModule,
    BudgetsModule,
    GoalsModule,
    TasksModule,
    RemindersModule,
    PushModule,
    InternalModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
