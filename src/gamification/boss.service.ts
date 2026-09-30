import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { findCategory } from '../categories/categories';
import { businessDay, monthOf } from '../common/time/business-time';
import { Prisma, type BossState } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { occurrencesInMonth } from '../recurrings/recurring-schedule';
import { toSchedule } from '../recurrings/recurrings.service';
import { GamificationService, type Rewarded } from './gamification.service';
import { XP_RULES } from './rules';

export interface BossView {
  name: string;
  icon: string;
  maxHpCents: number;
  hpCents: number;
  defeated: boolean;
  month: string;
  dueDate: string | null;
}

function toView(state: BossState, dueDate: string | null): BossView {
  return {
    name: state.name,
    icon: state.icon,
    maxHpCents: state.maxHpCents,
    hpCents: Math.max(0, state.maxHpCents - state.damageCents),
    defeated: state.defeatedAt !== null,
    month: state.month,
    dueDate,
  };
}

// Chefão do mês = maior recorrente de saída com vencimento no mês. O HP é
// congelado (snapshot) no 1º acesso do mês para não mudar no meio da luta.
@Injectable()
export class BossService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async get(userId: string): Promise<BossView | null> {
    const state = await this.currentState(
      this.prisma.db,
      userId,
      monthOf(businessDay()),
    );
    return state ? this.toViewWithDueDate(this.prisma.db, state) : null;
  }

  async attack(
    userId: string,
    amountCents: number,
  ): Promise<Rewarded<BossView>> {
    const month = monthOf(businessDay());
    return this.prisma.transaction(async (tx) => {
      const state = await this.currentState(tx, userId, month);
      if (!state) throw new NotFoundException('Sem chefão neste mês');
      if (state.defeatedAt) throw new ConflictException('Chefão já derrotado');

      const damageCents = Math.min(
        state.maxHpCents,
        state.damageCents + amountCents,
      );
      const defeated = damageCents >= state.maxHpCents;
      const updated = await tx.bossState.update({
        where: { id: state.id },
        data: { damageCents, defeatedAt: defeated ? new Date() : null },
      });
      await tx.bossAttack.create({ data: { userId, month, amountCents } });

      const reward = await this.gamification.award(
        userId,
        {
          ...XP_RULES.bossAttack,
          unlock: defeated ? ['cacador-de-chefao'] : [],
        },
        tx,
      );
      return { data: await this.toViewWithDueDate(tx, updated), reward };
    });
  }

  /** Junta o vencimento do mês da recorrente de origem (se ainda existir). */
  private async toViewWithDueDate(db: Tx, state: BossState): Promise<BossView> {
    if (!state.recurringId) return toView(state, null);
    const recurring = await db.recurring.findUnique({
      where: { id: state.recurringId },
    });
    if (!recurring) return toView(state, null);
    const dueDates = occurrencesInMonth(toSchedule(recurring), state.month);
    return toView(state, dueDates[0] ?? null);
  }

  private async currentState(
    db: Tx,
    userId: string,
    month: string,
  ): Promise<BossState | null> {
    const existing = await db.bossState.findUnique({
      where: { userId_month: { userId, month } },
    });
    if (existing) return existing;

    const recurrings = await db.recurring.findMany({
      where: { userId, type: 'expense' },
      orderBy: [{ amountCents: 'desc' }, { createdAt: 'asc' }],
    });
    const boss = recurrings.find(
      (r) => occurrencesInMonth(toSchedule(r), month).length > 0,
    );
    if (!boss) return null;

    try {
      return await db.bossState.create({
        data: {
          userId,
          month,
          name: boss.description,
          icon: findCategory(boss.categoryKey)?.icon ?? 'crown',
          maxHpCents: boss.amountCents,
          recurringId: boss.id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return db.bossState.findUnique({
          where: { userId_month: { userId, month } },
        });
      }
      throw error;
    }
  }
}
