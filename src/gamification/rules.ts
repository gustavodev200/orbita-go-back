import {
  addDays,
  addMonthsToDay,
  diffDays,
} from '../common/time/business-time';

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
export const DEFAULT_BOSS_ATTACK_CENTS = 30_000;

export const GOAL_FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const;
export type GoalFrequency = (typeof GOAL_FREQUENCIES)[number];

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

/** Passo atual da trilha (0–`steps`) a partir do valor guardado. */
export function goalStep(
  savedCents: number,
  targetCents: number,
  steps: number = GOAL_STEPS,
): number {
  if (targetCents <= 0) {
    return 0;
  }
  return Math.min(steps, Math.floor((savedCents / targetCents) * steps));
}

/**
 * Passos (1-based) após os quais abre um baú, proporcional ao tamanho da
 * trilha (~30% e ~70% do caminho). Pra `steps` = 10 (trilha padrão, sem
 * prazo/frequência) dá exatamente [3, 7] — mesmo resultado de sempre.
 */
export function chestStepsFor(steps: number): number[] {
  const candidates = [Math.round(steps * 0.3), Math.round(steps * 0.7)];
  return [...new Set(candidates)]
    .filter((step) => step > 0 && step < steps)
    .sort((a, b) => a - b);
}

/**
 * Datas (YYYY-MM-DD) de cada aporte esperado entre `trailStartDate` e
 * `deadline`, na cadência escolhida. Sempre termina exatamente no prazo
 * (o último intervalo absorve o resto, igual à divisão de valores por
 * passo) e sempre tem pelo menos 1 data.
 */
export function scheduleDatesOf(
  trailStartDate: string,
  deadline: string,
  frequency: GoalFrequency,
): string[] {
  function next(day: string): string {
    if (frequency === 'weekly') return addDays(day, 7);
    if (frequency === 'biweekly') return addDays(day, 15);
    return addMonthsToDay(day, 1);
  }

  const dates: string[] = [];
  let cur = next(trailStartDate);
  while (cur < deadline) {
    dates.push(cur);
    cur = next(cur);
  }
  dates.push(deadline);
  return dates;
}
