import { daysInMonth, weekdayOf } from '../common/time/business-time';

export interface ReminderSchedule {
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  dayOfMonth: number | null;
  weekday: number | null;
  /** YYYY-MM-DD — só usado quando `repeat === 'none'`. */
  date: string | null;
}

/**
 * A ocorrência do lembrete cai hoje (independente do horário)? Usado pelo cron
 * de dispatch-reminders para decidir se o `time` batendo com "agora" conta
 * como uma ocorrência de verdade (ex.: mensal só no dia certo do mês).
 */
export function isReminderDueOn(
  schedule: ReminderSchedule,
  today: string,
): boolean {
  switch (schedule.repeat) {
    case 'daily':
      return true;
    case 'weekly':
      return schedule.weekday !== null && weekdayOf(today) === schedule.weekday;
    case 'monthly': {
      if (schedule.dayOfMonth === null) return false;
      const month = today.slice(0, 7);
      const day = Math.min(schedule.dayOfMonth, daysInMonth(month));
      return Number(today.slice(8, 10)) === day;
    }
    case 'none':
      return schedule.date === today;
    default:
      return false;
  }
}

/** Quantos minutos para trás o cron ainda "recupera" um lembrete atrasado. */
export const DISPATCH_WINDOW_MINUTES = 30;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * O horário do lembrete (HH:mm) já chegou e está dentro da janela de
 * recuperação até `now` (HH:mm)? O cron roda a cada ~5 min e pode atrasar,
 * então exigir o minuto exato fazia quase todo lembrete nunca disparar. A
 * janela não atravessa a meia-noite: um lembrete de 23:50 só vale no próprio
 * dia (o dedupe por `lastFiredAt` impede disparo duplo dentro do dia).
 */
export function isInDispatchWindow(
  time: string,
  now: string,
  windowMinutes: number = DISPATCH_WINDOW_MINUTES,
): boolean {
  const t = toMinutes(time);
  const n = toMinutes(now);
  return t <= n && n - t <= windowMinutes;
}
