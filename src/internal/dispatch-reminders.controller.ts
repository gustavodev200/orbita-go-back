import {
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator';
import { DispatchRemindersService } from './dispatch-reminders.service';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Rota interna (não faz parte do contrato público consumido pelo front) —
// chamada só pelo GitHub Actions do cron, nunca por um usuário logado.
@ApiExcludeController()
@Controller('internal/dispatch-reminders')
export class DispatchRemindersController {
  constructor(
    private readonly config: ConfigService,
    private readonly dispatch: DispatchRemindersService,
  ) {}

  // @Public() libera do SupabaseJwtGuard global — a autenticação aqui é o
  // segredo compartilhado do cron (header), nunca um JWT de usuário.
  @Public()
  @Post()
  @HttpCode(200)
  async run(
    @Headers('x-cron-secret') secret?: string,
  ): Promise<{ dispatched: number }> {
    const expected = this.config.getOrThrow<string>('CRON_SECRET');
    if (!secret || !safeEqual(secret, expected)) {
      throw new UnauthorizedException();
    }
    return this.dispatch.run();
  }
}
