import { Injectable } from '@nestjs/common';
import {
  GamificationService,
  type Rewarded,
} from '../gamification/gamification.service';
import { XP_RULES } from '../gamification/rules';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { toMe, type Me } from '../users/me';
import type { OnboardingInput } from './dto/onboarding.schema';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: GoalsService,
    private readonly gamification: GamificationService,
  ) {}

  /** Idempotente: refazer o onboarding atualiza os dados, mas só premia uma vez. */
  async complete(userId: string, dto: OnboardingInput): Promise<Rewarded<Me>> {
    return this.prisma.transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { onboarded: true },
      });
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          name: dto.name,
          monthlyIncomeCents: dto.monthlyIncomeCents ?? null,
          enabledCategoryKeys: dto.categoryKeys,
          onboarded: true,
        },
      });
      if (dto.goal) {
        await this.goals.createInTx(tx, userId, dto.goal);
      }
      if (before.onboarded) {
        return { data: toMe(user), reward: null };
      }
      const reward = await this.gamification.award(
        userId,
        { ...XP_RULES.onboarding, unlock: ['primeiro-passo'] },
        tx,
      );
      return { data: reward.me, reward };
    });
  }
}
