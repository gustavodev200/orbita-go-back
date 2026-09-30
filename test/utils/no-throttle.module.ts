import { Module } from '@nestjs/common';

/**
 * Replaces ThrottlerModule.forRoot(...) in e2e tests (see test-app.ts). The
 * real per-IP rate limit (120 req/60s) is not what this suite exercises, and
 * a full walkthrough plus cross-user checks comfortably approaches that
 * number in a single run — disabling it removes a source of flaky,
 * unrelated 429s.
 */
@Module({})
export class NoThrottleModule {}
