import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FakeAuthGuard } from './fake-auth.guard';

/**
 * Drop-in replacement for the real AuthModule in e2e tests, swapped in via
 * `.overrideModule(AuthModule).useModule(TestAuthModule)` (see test-app.ts).
 *
 * `overrideProvider(APP_GUARD)` does NOT work for a guard registered as
 * `{ provide: APP_GUARD, useClass: X }` inside a *different* module's
 * `providers` array: Nest's DependenciesScanner resolves each APP_GUARD
 * registration to a concrete instance per defining module during
 * `applyApplicationProviders()`, and a provider-level override only patches
 * the InstanceWrapper found by an *exact* token match within each module —
 * it silently no-ops here (verified empirically: the override never gets
 * invoked and the real SupabaseJwtGuard keeps running). Overriding the whole
 * module (handled earlier, during the scan itself, before any of that
 * resolution happens) is the mechanism that actually works.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: FakeAuthGuard }],
})
export class TestAuthModule {}
