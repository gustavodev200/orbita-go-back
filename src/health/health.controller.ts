import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  @Get()
  check(): { ok: true } {
    return { ok: true };
  }
}
