import {
  addMonths,
  daysInMonth,
  monthOf,
  weekdayOf,
} from '../common/time/business-time';

export type Frequency = 'monthly' | 'weekly' | 'yearly';
export type RecurringStatus = 'paid' | 'pending' | 'overdue';

export interface Schedule {
  frequency: Frequency;
  /** mensal/anual: dia do mês (1–31, limitado ao último dia); semanal: dueDay % 7 (0 = domingo). */
  dueDay: number;
  /** YYYY-MM-DD — nenhuma ocorrência antes disso; anual usa o mês desta data. */
  startDate: string;
  endDate: string | null;
}

export interface Occurrence {
  dueDate: string;
  period: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Datas de vencimento da recorrente dentro do mês (YYYY-MM). */
export function occurrencesInMonth(
  schedule: Schedule,
  month: string,
): string[] {
  const lastDay = daysInMonth(month);
  let days: string[] = [];

  if (schedule.frequency === 'monthly') {
    days = [`${month}-${pad(Math.min(schedule.dueDay, lastDay))}`];
  } else if (schedule.frequency === 'yearly') {
    if (month.slice(5, 7) === schedule.startDate.slice(5, 7)) {
      days = [`${month}-${pad(Math.min(schedule.dueDay, lastDay))}`];
    }
  } else {
    const weekday = schedule.dueDay % 7;
    for (let day = 1; day <= lastDay; day++) {
      const date = `${month}-${pad(day)}`;
      if (weekdayOf(date) === weekday) days.push(date);
    }
  }

  return days.filter(
    (date) =>
      date >= schedule.startDate &&
      (!schedule.endDate || date <= schedule.endDate),
  );
}

/** Ocorrências com vencimento em [from, to] (inclusive). */
export function occurrencesBetween(
  schedule: Schedule,
  from: string,
  to: string,
): string[] {
  const result: string[] = [];
  for (
    let month = monthOf(from);
    month <= monthOf(to);
    month = addMonths(month, 1)
  ) {
    result.push(...occurrencesInMonth(schedule, month));
  }
  return result.filter((date) => date >= from && date <= to);
}

/** Chave do período pago: YYYY-MM (mensal), YYYY (anual), a própria data (semanal). */
export function periodKey(frequency: Frequency, dueDate: string): string {
  if (frequency === 'monthly') return dueDate.slice(0, 7);
  if (frequency === 'yearly') return dueDate.slice(0, 4);
  return dueDate;
}

export function recurringStatus(
  dueDate: string,
  paid: boolean,
  today: string,
): RecurringStatus {
  if (paid) return 'paid';
  return dueDate < today ? 'overdue' : 'pending';
}

/** Ocorrência "da vez": a 1ª ainda não paga; se todas pagas, a última. */
export function pickOccurrence(
  frequency: Frequency,
  dueDates: string[],
  paidPeriods: ReadonlySet<string>,
): Occurrence | null {
  if (dueDates.length === 0) return null;
  const occurrences = dueDates.map((dueDate) => ({
    dueDate,
    period: periodKey(frequency, dueDate),
  }));
  return (
    occurrences.find((occ) => !paidPeriods.has(occ.period)) ??
    occurrences[occurrences.length - 1]
  );
}
