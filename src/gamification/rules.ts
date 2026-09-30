import { diffDays } from '../common/time/business-time';

export const XP_TO_NEXT = 1500;

// Tabela de XP/moedas (contrato): um só lugar para calibrar a economia do jogo.
export const XP_RULES = {
  transaction: { xp: 10, coins: 2 },
  taskComplete: { xp: 5, coins: 0 },
  closeDay: { xp: 15, coins: 0 },
  recurringPay: { xp: 10, coins: 0 },
  goalDeposit: { xp: 20, coins: 0 },
  goalChestCoins: 50,
  onboarding: { xp: 50, coins: 0 },
  bossAttack: { xp: 10, coins: 0 },
} as const;

export const SHIELD_PRICE = 200;
export const GOAL_STEPS = 10;
export const GOAL_CHEST_STEPS = [3, 7] as const;
export const DEFAULT_BOSS_ATTACK_CENTS = 30_000;

export interface LevelState {
  level: number;
  xp: number;
  leveledUp: boolean;
}

/** Soma XP; a cada 1500 acumulados sobe um nível e o excedente carrega. */
export function applyXp(level: number, xp: number, gained: number): LevelState {
  let nextLevel = level;
  let nextXp = Math.max(0, xp + gained);
  while (nextXp >= XP_TO_NEXT) {
    nextXp -= XP_TO_NEXT;
    nextLevel += 1;
  }
  return { level: nextLevel, xp: nextXp, leveledUp: nextLevel > level };
}

/** Ofensiva exibida: só vale se o último dia fechado foi hoje ou ontem. */
export function effectiveStreak(
  streak: number,
  lastClosedDay: string | null,
  today: string,
): number {
  if (!lastClosedDay) {
    return 0;
  }
  return diffDays(lastClosedDay, today) <= 1 ? streak : 0;
}

/** Passo atual da trilha (0–10) a partir do valor guardado. */
export function goalStep(savedCents: number, targetCents: number): number {
  if (targetCents <= 0) {
    return 0;
  }
  return Math.min(
    GOAL_STEPS,
    Math.floor((savedCents / targetCents) * GOAL_STEPS),
  );
}
