import { addDays } from '../common/time/business-time';

export type ChallengeStatus =
  'upcoming' | 'active' | 'completed' | 'ended' | 'abandoned';

/** Último dia (inclusive) de um desafio de `durationDays` que começa em `startDate`. */
export function challengeEndDate(
  startDate: string,
  durationDays: number,
): string {
  return addDays(startDate, durationDays - 1);
}

export function challengeStatus(
  c: {
    startDate: string;
    durationDays: number;
    completed: boolean;
    abandoned: boolean;
  },
  today: string,
): ChallengeStatus {
  if (c.abandoned) return 'abandoned';
  if (c.completed) return 'completed';
  if (today < c.startDate) return 'upcoming';
  if (today <= challengeEndDate(c.startDate, c.durationDays)) return 'active';
  return 'ended';
}

/** Dias passados (dentro do desafio, antes de hoje) sem check-in. */
export function missedDays(
  startDate: string,
  durationDays: number,
  checked: Set<string>,
  today: string,
): number {
  const end = challengeEndDate(startDate, durationDays);
  let missed = 0;
  for (let day = startDate; day <= end && day < today; day = addDays(day, 1)) {
    if (!checked.has(day)) missed += 1;
  }
  return missed;
}
