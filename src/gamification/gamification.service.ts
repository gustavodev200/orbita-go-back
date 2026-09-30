import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { toMe, type Me } from '../users/me';
import { ACHIEVEMENTS, findAchievement, type AchievementKey } from './catalog';
import { applyXp } from './rules';

export interface AwardInput {
  xp?: number;
  coins?: number;
  /** Conquistas cuja condição o chamador já verificou (ex.: derrotou o chefão). */
  unlock?: AchievementKey[];
}

export interface RewardAchievement {
  key: string;
  title: string;
  description: string;
  icon: string;
}

export interface Reward {
  xp: number;
  coins: number;
  leveledUp: boolean;
  achievements: RewardAchievement[];
  me: Me;
}

export interface Rewarded<T> {
  data: T;
  reward: Reward | null;
}

const AUTO_LEVEL = 20;
const AUTO_TRANSACTIONS = 30;
const AUTO_CHESTS = 10;

// Única porta de ganho de XP/moedas/conquistas: level-up (1500 XP, excedente
// carrega) e desbloqueios acontecem na MESMA transação da ação que premiou.
@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  award(userId: string, input: AwardInput, tx?: Tx): Promise<Reward> {
    if (!tx) {
      return this.prisma.transaction((inner) =>
        this.award(userId, input, inner),
      );
    }
    return this.awardInTx(tx, userId, input);
  }

  private async awardInTx(
    tx: Tx,
    userId: string,
    input: AwardInput,
  ): Promise<Reward> {
    const xp = input.xp ?? 0;
    const coins = input.coins ?? 0;
    // Row lock: this is the single chokepoint every reward-granting endpoint
    // funnels through (transactions, tasks, goals, missions, streak, boss,
    // onboarding). Without it, two concurrent awards for the same user (a
    // double-click, a client retry, two tabs) both read the same xp/coins
    // baseline and the loser's write clobbers the winner's — a lost update,
    // silently dropping XP/coins rather than erroring. FOR UPDATE serializes
    // concurrent awards for this user: the second call blocks until the
    // first transaction commits, then reads the already-updated row.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const next = applyXp(user.level, user.xp, xp);

    const candidates = new Set<string>(input.unlock ?? []);
    for (const key of await this.autoAchievements(tx, userId, {
      level: next.level,
      streak: user.streak,
    })) {
      candidates.add(key);
    }

    let unlocked: string[] = [];
    if (candidates.size > 0) {
      const existing = await tx.userAchievement.findMany({
        where: { userId, achievementKey: { in: [...candidates] } },
        select: { achievementKey: true },
      });
      const owned = new Set(existing.map((row) => row.achievementKey));
      unlocked = [...candidates].filter((key) => !owned.has(key));
      if (unlocked.length > 0) {
        await tx.userAchievement.createMany({
          data: unlocked.map((achievementKey) => ({ userId, achievementKey })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { level: next.level, xp: next.xp, coins: user.coins + coins },
    });

    return {
      xp,
      coins,
      leveledUp: next.leveledUp,
      achievements: unlocked
        .map((key) => findAchievement(key))
        .filter((def) => def !== undefined)
        .map(({ key, title, description, icon }) => ({
          key,
          title,
          description,
          icon,
        })),
      me: toMe(updated),
    };
  }

  // Conquistas derivadas de contadores — reavaliadas a cada prêmio.
  private async autoAchievements(
    tx: Tx,
    userId: string,
    state: { level: number; streak: number },
  ): Promise<AchievementKey[]> {
    const keys: AchievementKey[] = [];
    if (state.level >= AUTO_LEVEL) keys.push('lenda');
    if (state.streak >= 7) keys.push('fogo-aceso');
    if (state.streak >= 30) keys.push('fogo-eterno');

    const [transactions, goals] = await Promise.all([
      tx.transaction.count({ where: { userId } }),
      tx.goal.findMany({ where: { userId }, select: { chestsOpened: true } }),
    ]);
    if (transactions >= AUTO_TRANSACTIONS) keys.push('olho-no-extrato');
    const chests = goals.reduce((sum, g) => sum + g.chestsOpened.length, 0);
    if (chests >= AUTO_CHESTS) keys.push('colecionador');
    return keys;
  }

  async listAchievements(userId: string) {
    const rows = await this.prisma.db.userAchievement.findMany({
      where: { userId },
    });
    const byKey = new Map(rows.map((row) => [row.achievementKey, row]));
    return ACHIEVEMENTS.map((def) => {
      const row = byKey.get(def.key);
      return {
        ...def,
        unlocked: !!row,
        unlockedAt: row ? row.unlockedAt.toISOString() : null,
      };
    });
  }
}
