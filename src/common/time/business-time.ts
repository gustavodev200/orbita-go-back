// Toda regra de "hoje" (ofensiva, missões, status de recorrente) usa o fuso de negócio.
export const BUSINESS_TZ = 'America/Sao_Paulo';
// São Paulo não tem horário de verão desde 2019: offset fixo.
const BUSINESS_UTC_OFFSET = '-03:00';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  hour: '2-digit',
  hourCycle: 'h23',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Dia de negócio (YYYY-MM-DD) do instante informado. */
export function businessDay(at: Date = new Date()): string {
  return dayFormatter.format(at);
}

export function businessHour(at: Date = new Date()): number {
  return Number(hourFormatter.format(at));
}

/** Horário de negócio (HH:mm) do instante informado — granularidade de minuto. */
export function businessTime(at: Date = new Date()): string {
  return timeFormatter.format(at);
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** YYYY-MM-DD para Date à meia-noite UTC (formato das colunas @db.Date). */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function dateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, amount: number): string {
  const date = dayToDate(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateToDay(date);
}

/** Diferença em dias: `to - from`. */
export function diffDays(from: string, to: string): number {
  return Math.round(
    (dayToDate(to).getTime() - dayToDate(from).getTime()) / 86_400_000,
  );
}

export function weekdayOf(day: string): number {
  return dayToDate(day).getUTCDay();
}

export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function addMonths(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return dateToDay(date).slice(0, 7);
}

/** Soma meses a um dia (YYYY-MM-DD) preservando o dia; clampa pro último dia se o mês de destino for mais curto. */
export function addMonthsToDay(day: string, amount: number): string {
  const [year, monthNumber, dayNumber] = day.split('-').map(Number);
  const firstOfTarget = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  const lastDayOfTarget = new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  const clampedDay = Math.min(dayNumber, lastDayOfTarget);
  return dateToDay(
    new Date(
      Date.UTC(
        firstOfTarget.getUTCFullYear(),
        firstOfTarget.getUTCMonth(),
        clampedDay,
      ),
    ),
  );
}

/** Intervalo [1º dia do mês, 1º dia do mês seguinte) para colunas @db.Date. */
export function monthDateRange(month: string): { gte: Date; lt: Date } {
  return {
    gte: dayToDate(`${month}-01`),
    lt: dayToDate(`${addMonths(month, 1)}-01`),
  };
}

/** Instante em que o dia de negócio começa (para colunas timestamptz). */
export function businessDayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000${BUSINESS_UTC_OFFSET}`);
}

export function businessDayRange(day: string): { gte: Date; lt: Date } {
  return { gte: businessDayStart(day), lt: businessDayStart(addDays(day, 1)) };
}
