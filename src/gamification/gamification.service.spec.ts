import type { PrismaService, Tx } from '../prisma/prisma.service';
import { GamificationService } from './gamification.service';
import { applyXp, effectiveStreak, goalStep } from './rules';

describe('applyXp', () => {
  it('acumula sem subir de nível abaixo de 1500', () => {
    expect(applyXp(7, 1240, 10)).toEqual({
      level: 7,
      xp: 1250,
      leveledUp: false,
    });
  });

  it('sobe de nível exatamente em 1500 e zera', () => {
    expect(applyXp(7, 1490, 10)).toEqual({ level: 8, xp: 0, leveledUp: true });
  });

  it('excedente carrega para o próximo nível', () => {
    expect(applyXp(1, 1495, 20)).toEqual({ level: 2, xp: 15, leveledUp: true });
  });

  it('ganho grande pode subir vários níveis', () => {
    expect(applyXp(1, 0, 3100)).toEqual({ level: 3, xp: 100, leveledUp: true });
  });
});

describe('effectiveStreak', () => {
  it('mantém a ofensiva se fechou hoje ou ontem', () => {
    expect(effectiveStreak(12, '2026-09-29', '2026-09-29')).toBe(12);
    expect(effectiveStreak(12, '2026-09-28', '2026-09-29')).toBe(12);
  });

  it('zera se pulou um dia ou nunca fechou', () => {
    expect(effectiveStreak(12, '2026-09-27', '2026-09-29')).toBe(0);
    expect(effectiveStreak(0, null, '2026-09-29')).toBe(0);
  });
});

describe('goalStep', () => {
  it('passo proporcional ao guardado, limitado a 10', () => {
    expect(goalStep(0, 800000)).toBe(0);
    expect(goalStep(320000, 800000)).toBe(4);
    expect(goalStep(900000, 800000)).toBe(10);
  });
});

describe('GamificationService.award', () => {
  const baseUser = {
    id: 'u1',
    email: 'marina@example.com',
    name: 'Marina',
    avatarUrl: null,
    onboarded: true,
    level: 7,
    xp: 1490,
    coins: 340,
    streak: 3,
    streakRecord: 21,
    shields: 0,
    lastClosedDay: null,
    theme: 'system',
    notificationsEnabled: true,
    monthlyIncomeCents: null,
    ownedItems: [],
    enabledCategoryKeys: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function buildTx(opts: { owned?: string[]; transactions?: number } = {}) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'u1' }]),
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(baseUser),
        update: jest.fn(({ data }: { data: object }) =>
          Promise.resolve({ ...baseUser, ...data }),
        ),
      },
      userAchievement: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opts.owned ?? []).map((achievementKey) => ({ achievementKey })),
          ),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      transaction: {
        count: jest.fn().mockResolvedValue(opts.transactions ?? 0),
      },
      goal: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return tx;
  }

  const service = new GamificationService({} as PrismaService);

  it('aplica XP e moedas, sobe de nível e devolve o Me atualizado', async () => {
    const tx = buildTx();
    const reward = await service.award(
      'u1',
      { xp: 20, coins: 2 },
      tx as unknown as Tx,
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { level: 8, xp: 10, coins: 342 },
    });
    expect(reward).toMatchObject({
      xp: 20,
      coins: 2,
      leveledUp: true,
      achievements: [],
      me: { level: 8, xp: 10, coins: 342, xpToNext: 1500 },
    });
  });

  it('desbloqueia conquistas novas e ignora as já obtidas', async () => {
    const tx = buildTx({ owned: ['primeiro-passo'], transactions: 30 });
    const reward = await service.award(
      'u1',
      { xp: 10, unlock: ['primeiro-passo', 'cofrinho'] },
      tx as unknown as Tx,
    );

    expect(tx.userAchievement.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'u1', achievementKey: 'cofrinho' },
        { userId: 'u1', achievementKey: 'olho-no-extrato' },
      ],
      skipDuplicates: true,
    });
    expect(reward.achievements.map((a) => a.key)).toEqual([
      'cofrinho',
      'olho-no-extrato',
    ]);
    expect(reward.achievements[0]).toEqual({
      key: 'cofrinho',
      title: 'Cofrinho',
      description: 'Guardou dinheiro na 1ª meta',
      icon: 'savings',
    });
  });

  it('não grava conquistas quando nada novo foi desbloqueado', async () => {
    const tx = buildTx();
    const reward = await service.award('u1', { xp: 5 }, tx as unknown as Tx);
    expect(tx.userAchievement.createMany).not.toHaveBeenCalled();
    expect(reward.leveledUp).toBe(false);
  });
});
