import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { spentByCategory } from '../budgets/budgets.service';
import {
  addDays,
  addMonths,
  businessDay,
  businessHour,
  dateToDay,
  dayToDate,
  diffDays,
  monthOf,
} from '../common/time/business-time';
import { Prisma } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { toMe, type Me } from '../users/me';
import type { AchievementKey } from './catalog';
import { GamificationService, type Rewarded } from './gamification.service';
import { effectiveStreak, SHIELD_PRICE, XP_RULES } from './rules';

export interface StreakView {
  streak: number;
  record: number;
  shields: number;
  days: { date: string; done: boolean }[];
  closedToday: boolean;
  /** Tamanho da ofensiva que acabou de zerar (gap sem escudo); 0 se não perdeu. */
  lostStreak: number;
}

@Injectable()
export class StreakService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  get(userId: string): Promise<StreakView> {
    return this.view(this.prisma.db, userId, businessDay());
  }

  async closeDay(userId: string): Promise<Rewarded<StreakView>> {
    const today = businessDay();
    return this.prisma.transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const lastClosed = user.lastClosedDay
        ? dateToDay(user.lastClosedDay)
        : null;
      if (lastClosed === today) {
        throw new ConflictException('Dia já fechado');
      }
      const streak = lastClosed === addDays(today, -1) ? user.streak + 1 : 1;
      await tx.streakDay.create({ data: { userId, day: dayToDate(today) } });
      await tx.user.update({
        where: { id: userId },
        data: {
          streak,
          streakRecord: Math.max(user.streakRecord, streak),
          lastClosedDay: dayToDate(today),
        },
      });

      const unlock: AchievementKey[] = [];
      if (businessHour() < 9) unlock.push('madrugador');
      if (await this.previousMonthWithinBudget(tx, userId, today)) {
        unlock.push('mao-de-vaca');
      }
      const reward = await this.gamification.award(
        userId,
        { ...XP_RULES.closeDay, unlock },
        tx,
      );
      return { data: await this.view(tx, userId, today), reward };
    });
  }

  /** Salva a ofensiva de 1 dia perdido (ontem): usa escudo ou compra por 200 moedas. */
  async useShield(userId: string): Promise<Me> {
    const today = businessDay();
    return this.prisma.transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.lastClosedDay || user.streak === 0) {
        throw new BadRequestException('Nenhuma ofensiva para proteger');
      }
      const gap = diffDays(dateToDay(user.lastClosedDay), today);
      if (gap <= 1) {
        throw new BadRequestException('Ofensiva não está em risco');
      }
      if (gap > 2) {
        throw new BadRequestException(
          'Ofensiva já perdida: o escudo protege só 1 dia',
        );
      }
      const payWithShield = user.shields > 0;
      if (!payWithShield && user.coins < SHIELD_PRICE) {
        throw new BadRequestException('Moedas insuficientes');
      }
      const yesterday = addDays(today, -1);
      try {
        await tx.streakDay.create({
          data: { userId, day: dayToDate(yesterday), shielded: true },
        });
      } catch (error) {
        // Concurrent double-submit of the shield action (or a stale
        // lastClosedDay read racing another request) would otherwise hit the
        // (userId, day) unique constraint and surface as an unhandled 500.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Ofensiva já protegida para este dia');
        }
        throw error;
      }
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          lastClosedDay: dayToDate(yesterday),
          ...(payWithShield
            ? { shields: { decrement: 1 } }
            : { coins: { decrement: SHIELD_PRICE } }),
        },
      });
      return toMe(updated, today);
    });
  }

  private async view(
    db: Tx,
    userId: string,
    today: string,
  ): Promise<StreakView> {
    const from = addDays(today, -6);
    const [user, days] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: userId } }),
      db.streakDay.findMany({
        where: {
          userId,
          day: { gte: dayToDate(from), lte: dayToDate(today) },
        },
        select: { day: true },
      }),
    ]);
    const closed = new Set(days.map((d) => dateToDay(d.day)));
    // `user.streak` (bruto) só é zerado no próximo close-day — enquanto isso,
    // >0 aqui com efetivo 0 significa "acabou de perder, ainda não fechou de novo".
    const effective = effectiveStreak(
      user.streak,
      user.lastClosedDay ? dateToDay(user.lastClosedDay) : null,
      today,
    );
    return {
      streak: effective,
      record: user.streakRecord,
      shields: user.shields,
      days: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(from, i);
        return { date, done: closed.has(date) };
      }),
      closedToday: closed.has(today),
      lostStreak: effective === 0 ? user.streak : 0,
    };
  }

  // "Mão de vaca": mês anterior com gastos e todos os orçamentos respeitados.
  private async previousMonthWithinBudget(
    tx: Tx,
    userId: string,
    today: string,
  ): Promise<boolean> {
    const budgets = await tx.budget.findMany({ where: { userId } });
    if (budgets.length === 0) return false;
    const spent = await spentByCategory(
      tx,
      userId,
      addMonths(monthOf(today), -1),
    );
    const total = [...spent.values()].reduce((a, b) => a + b, 0);
    return (
      total > 0 &&
      budgets.every((b) => (spent.get(b.categoryKey) ?? 0) <= b.limitCents)
    );
  }
}
