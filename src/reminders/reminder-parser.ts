import {
  addDays,
  addMonths,
  daysInMonth,
  weekdayOf,
} from '../common/time/business-time';

export interface ParsedReminder {
  title: string;
  kind: 'finance' | 'task';
  time: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  dayOfMonth?: number;
  weekday?: number;
  date?: string;
}

const WEEKDAYS: [RegExp, number][] = [
  [/domingo/, 0],
  [/segunda/, 1],
  [/ter[cç]a/, 2],
  [/quarta/, 3],
  [/quinta/, 4],
  [/sexta/, 5],
  [/s[aá]bado/, 6],
];

const FINANCE =
  /pag|conta|aluguel|fatura|boleto|internet|guardar|cart[aã]o|investir/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseTime(low: string): string {
  const colon = low.match(/(\d{1,2}):(\d{2})/);
  const hour = low.match(/(\d{1,2})\s*(?:h|horas?)(\d{2})?(?![a-zà-ú])/);
  const match = colon ?? hour;
  if (!match) return '09:00';
  const h = Number(match[1]);
  const m = Number(match[2] ?? 0);
  if (h > 23 || m > 59) return '09:00';
  return `${pad(h)}:${pad(m)}`;
}

function extractTitle(text: string, low: string): string {
  const match = low.match(
    /(?:lembra(?:r)? de|lembre de|lembrete de)\s+(.+?)(?:\s+todo|\s+toda|\s+dia\s+\d|\s+(?:às|as)\s+\d|\s+amanh[aã]|\s+hoje|\s+(?:na|no|toda|todo)\s+(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)|$)/,
  );
  const what =
    (match?.[1] ?? text.replace(/^\s*me\s+lembr[ae](?:r)?\s*/i, '')).trim() ||
    text.trim();
  return what.charAt(0).toUpperCase() + what.slice(1);
}

/** Próxima data (>= hoje) com o dia do mês informado. */
function nextDayOfMonth(day: number, today: string): string {
  let month = today.slice(0, 7);
  let date = `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
  if (date < today) {
    month = addMonths(month, 1);
    date = `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
  }
  return date;
}

/** Porta do `interpret()` da Tela Lembretes (regex; LLM entra depois). */
export function parseReminderText(text: string, today: string): ParsedReminder {
  const low = text.toLowerCase().trim();
  const dayMatch = Number(low.match(/dia (\d{1,2})/)?.[1]);
  const day = dayMatch >= 1 && dayMatch <= 31 ? dayMatch : undefined;
  const weekday = WEEKDAYS.find(([pattern]) => pattern.test(low))?.[1];
  const recurring = /tod[oa]s?\b|sempre/.test(low);

  const base = {
    title: extractTitle(text, low),
    kind: FINANCE.test(low) ? ('finance' as const) : ('task' as const),
    time: parseTime(low),
  };

  if (recurring) {
    if (day !== undefined || /m[eê]s/.test(low)) {
      return {
        ...base,
        repeat: 'monthly',
        dayOfMonth: day ?? Number(today.slice(8, 10)),
      };
    }
    if (weekday !== undefined || /semana/.test(low)) {
      return {
        ...base,
        repeat: 'weekly',
        weekday: weekday ?? weekdayOf(today),
      };
    }
    return { ...base, repeat: 'daily' };
  }

  let date = today;
  if (day !== undefined) date = nextDayOfMonth(day, today);
  else if (/amanh[aã]/.test(low)) date = addDays(today, 1);
  else if (weekday !== undefined) {
    date = addDays(today, (weekday - weekdayOf(today) + 7) % 7);
  }
  return { ...base, repeat: 'none', date };
}
