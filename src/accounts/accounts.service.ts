import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.db.account.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, icon: true, color: true },
    });
  }

  /** Garante que a conta pertence ao usuário (400 se não). */
  async assertOwned(tx: Tx, userId: string, accountId: string): Promise<void> {
    const account = await tx.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw new BadRequestException('accountId: conta inválida');
    }
  }

  /** Conta usada quando a recorrente não tem conta definida. */
  async defaultAccountId(tx: Tx, userId: string): Promise<string | null> {
    const account = await tx.account.findFirst({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return account?.id ?? null;
  }
}
