import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../src/auth/current-user.decorator';

/**
 * Testing-only replacement for SupabaseJwtGuard. Real JWT/JWKS verification is
 * never exercised in e2e tests — instead the "current" fake identity (settable
 * per-request via `setCurrentTestUser`) is attached directly to the request.
 *
 * This guard is wired in via `.overrideModule(AuthModule).useModule(TestAuthModule)`
 * in test-app.ts, which swaps out the real AuthModule (and therefore the real
 * SupabaseJwtGuard's APP_GUARD registration) entirely. ThrottlerGuard (the
 * other APP_GUARD, from AppModule) is untouched and still runs for real, so
 * rate limits still apply during e2e runs — see jest-e2e.json's maxWorkers:1
 * and the sequential-by-design walkthrough, which keep request volume low
 * enough not to trip it.
 */
let current: AuthenticatedUser | null = null;

export function setCurrentTestUser(user: AuthenticatedUser | null): void {
  current = user;
}

@Injectable()
export class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!current) {
      throw new UnauthorizedException('no fake test user set');
    }
    const request = context.switchToHttp().getRequest();
    request.user = current;
    return true;
  }
}
