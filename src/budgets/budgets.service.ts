import { BadRequestException, Injectable } from '@nestjs/common';
import { isCategoryOfType } from '../categories/categories';
import {
  businessDay,
  monthDateRange,
  monthOf,
} from '../common/time/business-time';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type { PutBudgetsInput } from './dto/budget.schema';

export interface BudgetDto {
  categoryKey: string;
  limitCents: number;
  spentCents: number;
}

/** Gasto (saídas) por categoria no mês. */
export async function spentByCategory(
  db: Tx,
  userId: string,
  month: string,
): Promise<Map<string, number>> {
  const groups = await db.transaction.groupBy({
    by: ['categoryKey'],
    where: { userId, type: 'expense', date: monthDateRange(month) },
    _sum: { amountCents: true },
  });
  return new Map(groups.map((g) => [g.categoryKey, g._sum.amountCents ?? 0]));
}

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, month?: string): Promise<BudgetDto[]> {
    const target = month ?? monthOf(businessDay());
    const [budgets, spent] = await Promise.all([
      this.prisma.db.budget.findMany({
        where: { userId },
        orderBy: { categoryKey: 'asc' },
      }),
      spentByCategory(this.prisma.db, userId, target),
    ]);
    return budgets.map((b) => ({
      categoryKey: b.categoryKey,
      limitCents: b.limitCents,
      spentCents: spent.get(b.categoryKey) ?? 0,
    }));
  }

  /** Substitui o conjunto de limites (categorias ausentes deixam de ter orçamento). */
  async replace(userId: string, dto: PutBudgetsInput): Promise<BudgetDto[]> {
    const keys = dto.items.map((item) => item.categoryKey);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('items: categoria repetida');
    }
    if (keys.some((key) => !isCategoryOfType(key, 'expense'))) {
      throw new BadRequestException('items: orçamento só para saídas');
    }
    await this.prisma.transaction(async (tx) => {
      await tx.budget.deleteMany({
        where: { userId, categoryKey: { notIn: keys } },
      });
      for (const item of dto.items) {
        await tx.budget.upsert({
          where: {
            userId_categoryKey: { userId, categoryKey: item.categoryKey },
          },
          create: { userId, ...item },
          update: { limitCents: item.limitCents },
        });
      }
    });
    return this.list(userId);
  }
}
