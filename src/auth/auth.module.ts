import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { SupabaseJwtGuard } from './supabase-jwt.guard';

@Module({
  imports: [UsersModule],
  providers: [{ provide: APP_GUARD, useClass: SupabaseJwtGuard }],
})
export class AuthModule {}
