import { weekdayOf } from '../common/time/business-time';
import type { PushPayload } from '../push/push-sender.service';
import { isInDispatchWindow } from '../reminders/reminder-due';

export interface HabitSchedule {
  weekdays: number[];
  reminderTime: string | null;
}

/**
 * O hábito precisa de aviso agora? Só quando tem horário, o horário caiu na
 * janela do cron, hoje é dia agendado, ainda não foi marcado e não avisamos
 * hoje (`lastFiredDay` = dia de negócio do último aviso).
 */
export function isHabitDue(
  habit: HabitSchedule,
  checkedToday: boolean,
  today: string,
  nowTime: string,
  lastFiredDay: string | null,
): boolean {
  if (!habit.reminderTime || checkedToday || lastFiredDay === today) {
    return false;
  }
  if (!habit.weekdays.includes(weekdayOf(today))) return false;
  return isInDispatchWindow(habit.reminderTime, nowTime);
}

export function buildHabitPayload(habit: {
  id: string;
  name: string;
  reminderTime: string | null;
}): PushPayload {
  return {
    title: habit.name,
    body: `Hábito de hoje · ${habit.reminderTime ?? ''}`.trim(),
    url: '/habitos',
    tag: `habit-${habit.id}`,
  };
}
