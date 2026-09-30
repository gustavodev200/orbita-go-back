import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { AuthModule } from '../../src/auth/auth.module';
import type { AuthenticatedUser } from '../../src/auth/current-user.decorator';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UsersService } from '../../src/users/users.service';
import { setCurrentTestUser } from './fake-auth.guard';
import { NoThrottleModule } from './no-throttle.module';
import { TestAuthModule } from './test-auth.module';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Boots the REAL Nest application (real Postgres via PrismaService, real
 * business logic) against a real HTTP listener, with the only substitution
 * being SupabaseJwtGuard -> FakeAuthGuard (see fake-auth.guard.ts) so tests
 * never mint or verify a real Supabase JWT.
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideModule(AuthModule)
    .useModule(TestAuthModule)
    .overrideModule(ThrottlerModule)
    .useModule(NoThrottleModule)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/** A fresh, uniquely identifiable throwaway identity for one test suite. */
export function makeTestIdentity(label: string): AuthenticatedUser & {
  name: string;
} {
  const id = randomUUID();
  return {
    id,
    email: `e2e-test-${label}-${id}@example.test`,
    name: `E2E ${label}`,
  };
}

/**
 * Replicates exactly what SupabaseJwtGuard does on a real first request
 * (upsert the User row + seed default accounts) — since FakeAuthGuard skips
 * that step entirely (it never touches Supabase/JWKS), every fresh test
 * identity must go through this once before any endpoint expects the row to
 * exist (e.g. `findUniqueOrThrow`-based reads in onboarding/gamification).
 */
export async function registerTestUser(
  app: INestApplication,
  identity: AuthenticatedUser & { name?: string | null },
): Promise<void> {
  await app.get(UsersService).ensureUser({
    id: identity.id,
    email: identity.email,
    name: identity.name ?? null,
    avatarUrl: null,
  });
}

export function loginAs(user: AuthenticatedUser): void {
  setCurrentTestUser(user);
}

export function logout(): void {
  setCurrentTestUser(null);
}

/**
 * Deletes the throwaway user (cascades to every owned row — accounts,
 * transactions, recurrings, budgets, goals, tasks, reminders, mission
 * claims, streak days, boss state/attacks, achievements, push subs — every
 * FK in schema.prisma back to `users` is `onDelete: Cascade`). Safe to call
 * even if the user row was never created.
 */
export async function deleteTestUser(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  await prisma.db.user.deleteMany({ where: { id: userId } });
}
