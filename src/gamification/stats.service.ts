import { Injectable } from '@nestjs/common';
import { spentByCategory } from '../budgets/budgets.service';
import { addMonths, businessDay, monthOf } from '../common/time/business-time';
import { PrismaService } from '../prisma/prisma.service';

export interface MonthSpending {
  month: string;
  byCategory: { key: string; cents: number }[];
  totalCents: number;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async compare(
    userId: string,
  ): Promise<{ previous: MonthSpending; current: MonthSpending }> {
    const current = monthOf(businessDay());
    const [previousData, currentData] = await Promise.all([
      this.monthSpending(userId, addMonths(current, -1)),
      this.monthSpending(userId, current),
    ]);
    return { previous: previousData, current: currentData };
  }

  private async monthSpending(
    userId: string,
    month: string,
  ): Promise<MonthSpending> {
    const spent = await spentByCategory(this.prisma.db, userId, month);
    const byCategory = [...spent.entries()]
      .map(([key, cents]) => ({ key, cents }))
      .sort((a, b) => b.cents - a.cents);
    return {
      month,
      byCategory,
      totalCents: byCategory.reduce((sum, c) => sum + c.cents, 0),
    };
  }
}
