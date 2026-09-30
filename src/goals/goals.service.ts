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
  chestStepsFor,
  GOAL_STEPS,
  goalStep,
  scheduleDatesOf,
  XP_RULES,
  type GoalFrequency,
} from '../gamification/rules';
import { businessDay } from '../common/time/business-time';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type { GoalInput, UpdateGoalInput } from './dto/goal.schema';

export interface GoalDto {
  id: string;
  name: string;
  icon: string;
  targetCents: number;
  savedCents: number;
  installmentCents: number | null;
  steps: number;
  currentStep: number;
  chestsOpened: number[];
  completed: boolean;
  deadline: string | null;
  frequency: GoalFrequency | null;
  trailStartDate: string | null;
}

/**
 * Quantos passos tem a trilha desta meta: por dinheiro (10 fixos) sem
 * prazo+frequência configurados; por data (1 passo por aporte esperado)
 * quando os dois estão presentes.
 */
function stepsFor(
  goal: Pick<Goal, 'deadline' | 'frequency' | 'trailStartDate'>,
): number {
  if (!goal.deadline || !goal.frequency || !goal.trailStartDate) {
    return GOAL_STEPS;
  }
  return scheduleDatesOf(goal.trailStartDate, goal.deadline, goal.frequency)
    .length;
}

export function toGoalDto(goal: Goal): GoalDto {
  const steps = stepsFor(goal);
  return {
    id: goal.id,
    name: goal.name,
    icon: goal.icon,
    targetCents: goal.targetCents,
    savedCents: goal.savedCents,
    installmentCents: goal.installmentCents,
    steps,
    currentStep: goalStep(goal.savedCents, goal.targetCents, steps),
    chestsOpened: goal.chestsOpened,
    completed: goal.completedAt !== null,
    deadline: goal.deadline,
    frequency: goal.frequency,
    trailStartDate: goal.trailStartDate,
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
    // Trilha por data só existe com prazo + frequência juntos; a âncora
    // começa a contar de hoje.
    const trailStartDate = dto.deadline && dto.frequency ? businessDay() : null;
    return tx.goal.create({
      data: { userId, ...dto, completedAt, trailStartDate },
    });
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
      // "Regenerar a trilha": mudar valor, prazo ou frequência reseta a
      // âncora da trilha por data pra hoje (ou apaga a trilha por data se
      // prazo/frequência deixaram de coexistir).
      const regenerate =
        'targetCents' in dto || 'deadline' in dto || 'frequency' in dto;
      const mergedDeadline = 'deadline' in dto ? dto.deadline : goal.deadline;
      const mergedFrequency =
        'frequency' in dto ? dto.frequency : goal.frequency;
      let trailStartDate = goal.trailStartDate;
      if (regenerate) {
        trailStartDate =
          mergedDeadline && mergedFrequency ? businessDay() : null;
      }
      const updated = await tx.goal.update({
        where: { id: goal.id },
        data: {
          ...dto,
          trailStartDate,
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
      const steps = stepsFor(goal);
      const step = goalStep(savedCents, goal.targetCents, steps);
      // Baús proporcionais ao tamanho da trilha (~30%/~70%): abrem ao passar, +50 moedas cada.
      const newChests = chestStepsFor(steps).filter(
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
