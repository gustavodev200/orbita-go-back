import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Goal } from '../generated/prisma/client';
import type { AchievementKey } from '../gamification/catalog';
import {
  GamificationService,
  type Rewarded,
} from '../gamification/gamification.service';
import {
  GOAL_CHEST_STEPS,
  GOAL_STEPS,
  goalStep,
  XP_RULES,
} from '../gamification/rules';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type { GoalInput, UpdateGoalInput } from './dto/goal.schema';

export interface GoalDto {
  id: string;
  name: string;
  icon: string;
  targetCents: number;
  savedCents: number;
  installmentCents: number | null;
  steps: typeof GOAL_STEPS;
  currentStep: number;
  chestsOpened: number[];
  completed: boolean;
  deadline: string | null;
}

export function toGoalDto(goal: Goal): GoalDto {
  return {
    id: goal.id,
    name: goal.name,
    icon: goal.icon,
    targetCents: goal.targetCents,
    savedCents: goal.savedCents,
    installmentCents: goal.installmentCents,
    steps: GOAL_STEPS,
    currentStep: goalStep(goal.savedCents, goal.targetCents),
    chestsOpened: goal.chestsOpened,
    completed: goal.completedAt !== null,
    deadline: goal.deadline,
  };
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async list(userId: string): Promise<GoalDto[]> {
    const goals = await this.prisma.db.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return goals.map(toGoalDto);
  }

  async create(userId: string, dto: GoalInput): Promise<GoalDto> {
    return toGoalDto(await this.createInTx(this.prisma.db, userId, dto));
  }

  createInTx(tx: Tx, userId: string, dto: GoalInput): Promise<Goal> {
    // Backfill de "já tenho guardado": se já nasce cheia, marca concluída na
    // hora (sem XP/conquista — isso não passou pelo fluxo de depósito).
    const completedAt =
      dto.savedCents != null && dto.savedCents >= dto.targetCents
        ? new Date()
        : null;
    return tx.goal.create({ data: { userId, ...dto, completedAt } });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateGoalInput,
  ): Promise<GoalDto> {
    return this.prisma.transaction(async (tx) => {
      const goal = await this.findOwned(tx, userId, id);
      const target = dto.targetCents ?? goal.targetCents;
      // goalSchema's cross-field refine only sees the fields present in THIS
      // request — a PATCH that sends only `installmentCents` (or only
      // `targetCents`) never has both in the same payload, so it always
      // skipped the check. Re-validate here against the merged (existing +
      // incoming) state, which is the only place that actually has both.
      const installment =
        dto.installmentCents === undefined
          ? goal.installmentCents
          : dto.installmentCents;
      if (installment !== null && installment > target) {
        throw new BadRequestException(
          'installmentCents: parcela não pode ser maior que a meta',
        );
      }
      const updated = await tx.goal.update({
        where: { id: goal.id },
        data: {
          ...dto,
          completedAt:
            goal.savedCents >= target ? (goal.completedAt ?? new Date()) : null,
        },
      });
      return toGoalDto(updated);
    });
  }

  async remove(userId: string, id: string): Promise<GoalDto> {
    return this.prisma.transaction(async (tx) => {
      const goal = await this.findOwned(tx, userId, id);
      await tx.goal.delete({ where: { id: goal.id } });
      return toGoalDto(goal);
    });
  }

  async deposit(
    userId: string,
    id: string,
    amountCents: number,
  ): Promise<Rewarded<GoalDto>> {
    return this.prisma.transaction(async (tx) => {
      const goal = await this.findOwned(tx, userId, id);
      if (goal.completedAt) {
        throw new ConflictException('Meta já concluída');
      }
      const isFirstDeposit = !(await tx.goal.findFirst({
        where: { userId, savedCents: { gt: 0 } },
        select: { id: true },
      }));

      const savedCents = Math.min(
        goal.targetCents,
        goal.savedCents + amountCents,
      );
      const step = goalStep(savedCents, goal.targetCents);
      // Baús após os passos 3 e 7: abrem ao passar, +50 moedas cada.
      const newChests = GOAL_CHEST_STEPS.filter(
        (chest) => step >= chest && !goal.chestsOpened.includes(chest),
      );
      const completed = savedCents >= goal.targetCents;

      const updated = await tx.goal.update({
        where: { id: goal.id },
        data: {
          savedCents,
          chestsOpened: [...goal.chestsOpened, ...newChests],
          completedAt: completed ? new Date() : null,
        },
      });

      const unlock: AchievementKey[] = [];
      if (isFirstDeposit) unlock.push('cofrinho');
      if (completed) unlock.push('zerou-a-trilha');
      const reward = await this.gamification.award(
        userId,
        {
          xp: XP_RULES.goalDeposit.xp,
          coins: newChests.length * XP_RULES.goalChestCoins,
          unlock,
        },
        tx,
      );
      return { data: toGoalDto(updated), reward };
    });
  }

  private async findOwned(tx: Tx, userId: string, id: string): Promise<Goal> {
    const goal = await tx.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Meta não encontrada');
    return goal;
  }
}
