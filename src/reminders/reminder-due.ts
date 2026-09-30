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
