import { addDays, weekdayOf } from '../common/time/business-time';

/** Limite de segurança para a varredura (pouco mais de um ano). */
const MAX_DAYS = 400;

/**
 * Dias agendados consecutivos marcados, terminando hoje. Dias fora de
 * `weekdays` são pulados (não quebram nem somam). Se hoje é agendado e ainda
 * não foi marcado, o dia não acabou: conta a partir de ontem sem zerar.
 */
export function habitStreak(
  weekdays: number[],
  checked: Set<string>,
  today: string,
): number {
  const scheduled = new Set(weekdays);
  let streak = 0;
  for (let i = 0; i < MAX_DAYS; i++) {
    const day = addDays(today, -i);
    if (!scheduled.has(weekdayOf(day))) continue;
    if (checked.has(day)) {
      streak += 1;
      continue;
    }
    if (i === 0) continue;
    break;
  }
  return streak;
}
