import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { isCategoryOfType } from '../categories/categories';
import {
  addDays,
  addMonths,
  businessDay,
  dateToDay,
  dayToDate,
  monthOf,
} from '../common/time/business-time';
import type { Recurring, RecurringPayment } from '../generated/prisma/client';
import type { AchievementKey } from '../gamification/catalog';
import {
  GamificationService,
  type Rewarded,
} from '../gamification/gamification.service';
import { XP_RULES } from '../gamification/rules';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type {
  CreateRecurringInput,
  UpdateRecurringInput,
} from './dto/recurring.schema';
import {
  occurrencesBetween,
  occurrencesInMonth,
  pickOccurrence,
  recurringStatus,
  type Occurrence,
  type RecurringStatus,
  type Schedule,
} from './recurring-schedule';

export interface RecurringDto {
  id: string;
  description: string;
  amountCents: number;
  categoryKey: string;
  type: 'expense' | 'income';
  frequency: 'monthly' | 'weekly' | 'yearly';
  dueDay: number;
  endDate: string | null;
  accountId: string | null;
  status?: RecurringStatus;
  dueDate?: string;
  paidAt?: string | null;
}

type RecurringWithPayments = Recurring & { payments: RecurringPayment[] };

export function toSchedule(recurring: Recurring): Schedule {
  return {
    frequency: recurring.frequency,
    dueDay: recurring.dueDay,
    startDate: dateToDay(recurring.startDate),
    endDate: recurring.endDate ? dateToDay(recurring.endDate) : null,
  };
}

function toDto(
  recurring: Recurring,
  occurrence?: { occ: Occurrence; payment: RecurringPayment | undefined },
  today: string = businessDay(),
): RecurringDto {
  const base: RecurringDto = {
    id: recurring.id,
    description: recurring.description,
    amountCents: recurring.amountCents,
    categoryKey: recurring.categoryKey,
    type: recurring.type,
    frequency: recurring.frequency,
    dueDay: recurring.dueDay,
    endDate: recurring.endDate ? dateToDay(recurring.endDate) : null,
    accountId: recurring.accountId,
  };
  if (!occurrence) return base;
  const { occ, payment } = occurrence;
  return {
    ...base,
    status: recurringStatus(occ.dueDate, !!payment, today),
    dueDate: occ.dueDate,
    paidAt: payment ? payment.paidAt.toISOString() : null,
  };
}

function withOccurrence(
  recurring: RecurringWithPayments,
  dueDates: string[],
): { occ: Occurrence; payment: RecurringPayment | undefined } | undefined {
  const byPeriod = new Map(recurring.payments.map((p) => [p.period, p]));
  const occ = pickOccurrence(
    recurring.frequency,
    dueDates,
    new Set(byPeriod.keys()),
  );
  return occ ? { occ, payment: byPeriod.get(occ.period) } : undefined;
}

@Injectable()
export class RecurringsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly gamification: GamificationService,
  ) {}

  private findAll(userId: string): Promise<RecurringWithPayments[]> {
    return this.prisma.db.recurring.findMany({
      where: { userId },
      include: { payments: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async findOwned(
    tx: Tx,
    userId: string,
    id: string,
  ): Promise<RecurringWithPayments> {
    const recurring = await tx.recurring.findFirst({
      where: { id, userId },
      include: { payments: true },
    });
    if (!recurring) throw new NotFoundException('Recorrente não encontrada');
    return recurring;
  }

  /** Recorrentes com vencimento no mês, com status da ocorrência. */
  async list(userId: string, month?: string): Promise<RecurringDto[]> {
    const target = month ?? monthOf(businessDay());
    const recurrings = await this.findAll(userId);
    return recurrings
      .map((r) => {
        const occurrence = withOccurrence(
          r,
          occurrencesInMonth(toSchedule(r), target),
        );
        return occurrence ? toDto(r, occurrence) : null;
      })
      .filter((dto): dto is RecurringDto => dto !== null)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  }

  /** Vencimentos entre hoje e hoje + `days`. */
  async upcoming(userId: string, days: number): Promise<RecurringDto[]> {
    const today = businessDay();
    const until = addDays(today, days);
    const recurrings = await this.findAll(userId);
    return recurrings
      .map((r) => {
        const occurrence = withOccurrence(
          r,
          occurrencesBetween(toSchedule(r), today, until),
        );
        return occurrence ? toDto(r, occurrence, today) : null;
      })
      .filter((dto): dto is RecurringDto => dto !== null)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  }

  async create(
    userId: string,
    dto: CreateRecurringInput,
  ): Promise<RecurringDto> {
    return this.prisma.transaction(async (tx) => {
      const recurring = await this.createInTx(tx, userId, dto, businessDay());
      return this.dtoForMonth(recurring);
    });
  }

  /** Também usado por POST /transactions com `recurring`. */
  async createInTx(
    tx: Tx,
    userId: string,
    dto: CreateRecurringInput,
    startDate: string,
  ): Promise<RecurringWithPayments> {
    this.assertCategory(dto.categoryKey, dto.type);
    if (dto.accountId) {
      await this.accounts.assertOwned(tx, userId, dto.accountId);
    }
    return tx.recurring.create({
      data: {
        userId,
        description: dto.description,
        amountCents: dto.amountCents,
        categoryKey: dto.categoryKey,
        type: dto.type,
        frequency: dto.frequency,
        dueDay: dto.dueDay,
        startDate: dayToDate(startDate),
        endDate: dto.endDate ? dayToDate(dto.endDate) : null,
        accountId: dto.accountId ?? null,
      },
      include: { payments: true },
    });
  }

  /**
   * Lançamento criado junto com a recorrente quita a ocorrência do mês do
   * lançamento (se houver) — evita cobrar de novo o que acabou de ser pago.
   */
  async markPaidByTransaction(
    tx: Tx,
    recurring: Recurring,
    transaction: { id: string; date: Date },
  ): Promise<void> {
    const day = dateToDay(transaction.date);
    const occ = pickOccurrence(
      recurring.frequency,
      occurrencesInMonth(toSchedule(recurring), monthOf(day)),
      new Set(),
    );
    if (!occ) return;
    await tx.recurringPayment.create({
      data: {
        recurringId: recurring.id,
        period: occ.period,
        dueDate: dayToDate(occ.dueDate),
        onTime: day <= occ.dueDate,
        transactionId: transaction.id,
      },
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateRecurringInput,
  ): Promise<RecurringDto> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.findOwned(tx, userId, id);
      this.assertCategory(
        dto.categoryKey ?? current.categoryKey,
        dto.type ?? current.type,
      );
      if (dto.accountId) {
        await this.accounts.assertOwned(tx, userId, dto.accountId);
      }
      const updated = await tx.recurring.update({
        where: { id: current.id },
        data: {
          description: dto.description,
          amountCents: dto.amountCents,
          categoryKey: dto.categoryKey,
          type: dto.type,
          frequency: dto.frequency,
          dueDay: dto.dueDay,
          endDate:
            dto.endDate === undefined
              ? undefined
              : dto.endDate
                ? dayToDate(dto.endDate)
                : null,
          accountId: dto.accountId,
        },
        include: { payments: true },
      });
      return this.dtoForMonth(updated);
    });
  }

  async remove(userId: string, id: string): Promise<RecurringDto> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.findOwned(tx, userId, id);
      await tx.recurring.delete({ where: { id: current.id } });
      return toDto(current);
    });
  }

  async pay(
    userId: string,
    id: string,
    month?: string,
  ): Promise<Rewarded<RecurringDto>> {
    const today = businessDay();
    const target = month ?? monthOf(today);
    return this.prisma.transaction(async (tx) => {
      const recurring = await this.findOwned(tx, userId, id);
      const dueDates = occurrencesInMonth(toSchedule(recurring), target);
      const paid = new Set(recurring.payments.map((p) => p.period));
      const occ = pickOccurrence(recurring.frequency, dueDates, paid);
      if (!occ) {
        throw new BadRequestException('Recorrente sem vencimento neste mês');
      }
      if (paid.has(occ.period)) {
        throw new ConflictException('Recorrente já paga neste período');
      }

      const accountId =
        recurring.accountId ??
        (await this.accounts.defaultAccountId(tx, userId));
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: recurring.type,
          amountCents: recurring.amountCents,
          description: recurring.description,
          categoryKey: recurring.categoryKey,
          date: dayToDate(today),
          accountId,
          recurringId: recurring.id,
        },
      });
      const payment = await tx.recurringPayment.create({
        data: {
          recurringId: recurring.id,
          period: occ.period,
          dueDate: dayToDate(occ.dueDate),
          onTime: today <= occ.dueDate,
          transactionId: transaction.id,
        },
      });

      const unlock: AchievementKey[] = [];
      if (await this.threeMonthsOnTime(tx, userId, monthOf(today))) {
        unlock.push('sem-dividas');
      }
      const reward = await this.gamification.award(
        userId,
        { ...XP_RULES.recurringPay, unlock },
        tx,
      );
      return {
        data: toDto(recurring, { occ, payment }, today),
        reward,
      };
    });
  }

  // "Sem dívidas": pagamentos em cada um dos últimos 3 meses e nenhum atrasado.
  private async threeMonthsOnTime(
    tx: Tx,
    userId: string,
    currentMonth: string,
  ): Promise<boolean> {
    const from = addMonths(currentMonth, -2);
    const payments = await tx.recurringPayment.findMany({
      where: {
        recurring: { userId },
        dueDate: {
          gte: dayToDate(`${from}-01`),
          lt: dayToDate(`${addMonths(currentMonth, 1)}-01`),
        },
      },
      select: { dueDate: true, onTime: true },
    });
    if (payments.some((p) => !p.onTime)) return false;
    const months = new Set(payments.map((p) => monthOf(dateToDay(p.dueDate))));
    return months.size >= 3;
  }

  private dtoForMonth(recurring: RecurringWithPayments): RecurringDto {
    const today = businessDay();
    const occurrence = withOccurrence(
      recurring,
      occurrencesInMonth(toSchedule(recurring), monthOf(today)),
    );
    return toDto(recurring, occurrence, today);
  }

  private assertCategory(categoryKey: string, type: string): void {
    if (!isCategoryOfType(categoryKey, type as 'expense' | 'income')) {
      throw new BadRequestException(
        'categoryKey: categoria não corresponde ao tipo',
      );
    }
  }
}
