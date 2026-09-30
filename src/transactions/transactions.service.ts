import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { isCategoryOfType } from '../categories/categories';
import { mapNotFound } from '../common/errors';
import {
  businessDay,
  dateToDay,
  dayToDate,
  daysInMonth,
  monthDateRange,
  monthOf,
} from '../common/time/business-time';
import type { Transaction } from '../generated/prisma/client';
import {
  GamificationService,
  type Rewarded,
} from '../gamification/gamification.service';
import { XP_RULES } from '../gamification/rules';
import { PrismaService } from '../prisma/prisma.service';
import { RecurringsService } from '../recurrings/recurrings.service';
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from './dto/transaction.schema';
import {
  parseTransactionText,
  type ParsedTransaction,
} from './transaction-parser';

export interface TransactionDto {
  id: string;
  type: 'expense' | 'income';
  amountCents: number;
  description: string;
  categoryKey: string;
  date: string;
  accountId: string | null;
  recurringId: string | null;
  createdAt: string;
}

export interface MonthSummary {
  balanceCents: number;
  incomeCents: number;
  expenseCents: number;
  daily: { day: number; incomeCents: number; expenseCents: number }[];
}

export function toTransactionDto(t: Transaction): TransactionDto {
  return {
    id: t.id,
    type: t.type,
    amountCents: t.amountCents,
    description: t.description,
    categoryKey: t.categoryKey,
    date: dateToDay(t.date),
    accountId: t.accountId,
    recurringId: t.recurringId,
    createdAt: t.createdAt.toISOString(),
  };
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly recurrings: RecurringsService,
    private readonly gamification: GamificationService,
  ) {}

  async list(
    userId: string,
    query: ListTransactionsQuery,
  ): Promise<TransactionDto[]> {
    const month = query.month ?? monthOf(businessDay());
    const rows = await this.prisma.db.transaction.findMany({
      where: {
        userId,
        date: monthDateRange(month),
        type: query.type,
        categoryKey: query.category,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toTransactionDto);
  }

  async create(
    userId: string,
    dto: CreateTransactionInput,
  ): Promise<Rewarded<TransactionDto>> {
    this.assertCategory(dto.categoryKey, dto.type);
    return this.prisma.transaction(async (tx) => {
      await this.accounts.assertOwned(tx, userId, dto.accountId);

      const recurring = dto.recurring
        ? await this.recurrings.createInTx(
            tx,
            userId,
            {
              description: dto.description,
              amountCents: dto.amountCents,
              categoryKey: dto.categoryKey,
              type: dto.type,
              frequency: dto.recurring.frequency,
              dueDay: dto.recurring.dueDay,
              endDate: dto.recurring.endDate ?? null,
              accountId: dto.accountId,
            },
            dto.date,
          )
        : null;

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: dto.type,
          amountCents: dto.amountCents,
          description: dto.description,
          categoryKey: dto.categoryKey,
          date: dayToDate(dto.date),
          accountId: dto.accountId,
          recurringId: recurring?.id ?? null,
        },
      });
      if (recurring) {
        await this.recurrings.markPaidByTransaction(tx, recurring, transaction);
      }

      const reward = await this.gamification.award(
        userId,
        { ...XP_RULES.transaction, unlock: ['primeiro-passo'] },
        tx,
      );
      return { data: toTransactionDto(transaction), reward };
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionInput,
  ): Promise<TransactionDto> {
    return this.prisma.transaction(async (tx) => {
      const current = await tx.transaction.findFirst({ where: { id, userId } });
      if (!current) throw new NotFoundException('Lançamento não encontrado');
      this.assertCategory(
        dto.categoryKey ?? current.categoryKey,
        dto.type ?? current.type,
      );
      if (dto.accountId) {
        await this.accounts.assertOwned(tx, userId, dto.accountId);
      }
      const updated = await tx.transaction.update({
        where: { id: current.id },
        data: {
          type: dto.type,
          amountCents: dto.amountCents,
          description: dto.description,
          categoryKey: dto.categoryKey,
          date: dto.date ? dayToDate(dto.date) : undefined,
          accountId: dto.accountId,
        },
      });
      return toTransactionDto(updated);
    });
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    try {
      await this.prisma.db.transaction.delete({ where: { id, userId } });
    } catch (error) {
      throw mapNotFound(error, 'Lançamento não encontrado');
    }
    return { ok: true };
  }

  async summary(userId: string, month?: string): Promise<MonthSummary> {
    const target = month ?? monthOf(businessDay());
    const rows = await this.prisma.db.transaction.findMany({
      where: { userId, date: monthDateRange(target) },
      select: { type: true, amountCents: true, date: true },
    });
    const daily = Array.from({ length: daysInMonth(target) }, (_, i) => ({
      day: i + 1,
      incomeCents: 0,
      expenseCents: 0,
    }));
    let incomeCents = 0;
    let expenseCents = 0;
    for (const row of rows) {
      const bucket = daily[row.date.getUTCDate() - 1];
      if (row.type === 'income') {
        incomeCents += row.amountCents;
        bucket.incomeCents += row.amountCents;
      } else {
        expenseCents += row.amountCents;
        bucket.expenseCents += row.amountCents;
      }
    }
    return {
      balanceCents: incomeCents - expenseCents,
      incomeCents,
      expenseCents,
      daily,
    };
  }

  parse(text: string): ParsedTransaction {
    return parseTransactionText(text, businessDay());
  }

  private assertCategory(categoryKey: string, type: 'expense' | 'income') {
    if (!isCategoryOfType(categoryKey, type)) {
      throw new BadRequestException(
        'categoryKey: categoria não corresponde ao tipo',
      );
    }
  }
}
