import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  businessDay,
  businessDayRange,
  dayToDate,
} from '../common/time/business-time';
import { Prisma } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { isMissionComplete, MISSIONS, type MissionDef } from './catalog';
import { GamificationService, type Rewarded } from './gamification.service';

export interface MissionView {
  key: string;
  title: string;
  icon: string;
  progress: number;
  target: number;
  unit: 'count' | 'cents';
  xp: number;
  coins: number;
  claimed: boolean;
}

interface DayProgress {
  progress: Record<MissionDef['key'], number>;
  closedToday: boolean;
  claimed: Set<string>;
}

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async today(userId: string): Promise<MissionView[]> {
    const today = businessDay();
    const state = await this.dayProgress(this.prisma.db, userId, today);
    return MISSIONS.map((m) => toView(m, state));
  }

  async claim(userId: string, key: string): Promise<Rewarded<MissionView>> {
    const mission = MISSIONS.find((m) => m.key === key);
    if (!mission) throw new NotFoundException('Missão não encontrada');
    const today = businessDay();
    return this.prisma.transaction(async (tx) => {
      const state = await this.dayProgress(tx, userId, today);
      if (state.claimed.has(mission.key)) {
        throw new ConflictException('Missão já resgatada hoje');
      }
      if (
        !isMissionComplete(
          mission,
          state.progress[mission.key],
          state.closedToday,
        )
      ) {
        throw new BadRequestException('Missão ainda não concluída');
      }
      try {
        await tx.missionClaim.create({
          data: { userId, missionKey: mission.key, day: dayToDate(today) },
        });
      } catch (error) {
        // Concurrent double-submit races past the `state.claimed.has` check
        // above (both reads happen before either write commits) — without
        // this, the loser hits the (userId, missionKey, day) unique
        // constraint and surfaces as an unhandled 500 instead of the same
        // 409 a sequential double-claim already gets.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Missão já resgatada hoje');
        }
        throw error;
      }
      state.claimed.add(mission.key);
      const reward = await this.gamification.award(
        userId,
        { xp: mission.xp, coins: mission.coins },
        tx,
      );
      return { data: toView(mission, state), reward };
    });
  }

  private async dayProgress(
    db: Tx,
    userId: string,
    today: string,
  ): Promise<DayProgress> {
    const range = businessDayRange(today);
    const [transactions, tasks, spent, closed, claims] = await Promise.all([
      db.transaction.count({ where: { userId, createdAt: range } }),
      db.task.count({ where: { userId, done: true, doneAt: range } }),
      db.transaction.aggregate({
        where: { userId, type: 'expense', date: dayToDate(today) },
        _sum: { amountCents: true },
      }),
      db.streakDay.findUnique({
        where: { userId_day: { userId, day: dayToDate(today) } },
        select: { id: true },
      }),
      db.missionClaim.findMany({
        where: { userId, day: dayToDate(today) },
        select: { missionKey: true },
      }),
    ]);
    return {
      progress: {
        'registrar-lancamentos': transactions,
        'concluir-tarefas': tasks,
        'gastar-pouco': spent._sum.amountCents ?? 0,
      },
      closedToday: !!closed,
      claimed: new Set(claims.map((c) => c.missionKey)),
    };
  }
}

function toView(mission: MissionDef, state: DayProgress): MissionView {
  return {
    key: mission.key,
    title: mission.title,
    icon: mission.icon,
    progress: state.progress[mission.key],
    target: mission.target,
    unit: mission.unit,
    xp: mission.xp,
    coins: mission.coins,
    claimed: state.claimed.has(mission.key),
  };
}
