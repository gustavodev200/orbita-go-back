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

/**
 * Maior sequência de dias agendados marcados entre `from` e `today`
 * (inclusive). Mesma regra de `habitStreak`: dias fora de `weekdays` são
 * pulados; hoje agendado e ainda não marcado não quebra a sequência.
 */
export function habitBestStreak(
  weekdays: number[],
  checked: Set<string>,
  from: string,
  today: string,
): number {
  const scheduled = new Set(weekdays);
  let best = 0;
  let run = 0;
  for (let day = from; day <= today; day = addDays(day, 1)) {
    if (!scheduled.has(weekdayOf(day))) continue;
    if (checked.has(day)) {
      run += 1;
      best = Math.max(best, run);
    } else if (day !== today) {
      run = 0;
    }
  }
  return best;
}
