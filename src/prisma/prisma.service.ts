import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';

export type Tx = Prisma.TransactionClient;

// Reaproveita o client entre invocações "quentes" da função serverless — sem isso
// cada cold start abre conexão nova e esgota o pooler do Supabase.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient;

  constructor(config: ConfigService) {
    this.db =
      globalForPrisma.prisma ??
      new PrismaClient({
        adapter: new PrismaPg({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
        }),
      });
    globalForPrisma.prisma = this.db;
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.$transaction(fn);
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
