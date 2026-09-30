import { findCategory } from '../categories/categories';
import { addDays, addMonths, daysInMonth } from '../common/time/business-time';

export interface ParsedTransaction {
  type: 'expense' | 'income';
  amountCents: number;
  description: string;
  categoryKey: string;
  date: string;
}

// Limite de palavra que entende acentos (o \b do JS só conhece ASCII).
const L = '(?:^|[^a-z0-9à-ú])';
const R = '(?=$|[^a-z0-9à-ú])';
const words = (alternatives: string): RegExp =>
  new RegExp(`${L}(?:${alternatives})${R}`);

// Ordem importa: a 1ª regra que casar define a categoria.
const EXPENSE_HINTS: [RegExp, string][] = [
  [
    words(
      'netflix|spotify|assinatura|prime video|disney\\+?|hbo|max|youtube premium|deezer',
    ),
    'ass',
  ],
  [
    words(
      'ifood|almo[cç]o|almocei|jantar?|jantei|restaurante|lanche|caf[eé]|pizza|padaria|hamb[uú]rguer|sushi|a[cç]a[ií]',
    ),
    'ali',
  ],
  [
    words(
      'uber|99|99pop|t[aá]xi|gasolina|combust[ií]vel|[oô]nibus|metr[oô]|estacionamento|ped[aá]gio',
    ),
    'tra',
  ],
  [words('mercado|supermercado|feira|hortifruti|a[cç]ougue|sacol[aã]o'), 'mer'],
  [words('cinema|show|jogo|bar|balada|teatro|ingresso|viagem'), 'laz'],
  [
    words('farm[aá]cia|rem[eé]dio|m[eé]dico|consulta|dentista|exame|academia'),
    'sau',
  ],
  [
    words('aluguel|luz|energia|[aá]gua|condom[ií]nio|g[aá]s|internet|iptu'),
    'cas',
  ],
  [words('curso|livro|faculdade|escola|mensalidade'), 'edu'],
  [words('ra[cç][aã]o|pet|petshop|veterin[aá]rio'), 'pet'],
  [
    words('roupa|roupas|camisa|camiseta|cal[cç]a|t[eê]nis|sapato|vestido'),
    'rou',
  ],
];

const INCOME_HINTS: [RegExp, string][] = [
  [words('freela|freelance|job|projeto|cliente'), 'fre'],
  [words('rendimento|rendeu|juros|dividendos?|cdb|tesouro'), 'inv'],
  [words('presente|presentearam'), 'pre'],
  [words('sal[aá]rio|pagamento'), 'sal'],
];

const INCOME_TRIGGER = words(
  'recebi|ganhei|sal[aá]rio|entrou|caiu|rendeu|rendimento|freela|freelance',
);

const AMOUNT =
  /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:reais|conto|pila))?/;

const FILLER = new Set([
  'gastei',
  'paguei',
  'comprei',
  'recebi',
  'ganhei',
  'entrou',
  'caiu',
  'rendeu',
  'no',
  'na',
  'nos',
  'nas',
  'em',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'com',
  'um',
  'uma',
  'o',
  'a',
  'os',
  'as',
  'hoje',
  'ontem',
  'anteontem',
  'r$',
  'reais',
  'conto',
  'pila',
  'dia',
]);

const BRANDS: Record<string, string> = {
  ifood: 'iFood',
  uber: 'Uber',
  netflix: 'Netflix',
  spotify: 'Spotify',
};

function parseAmountCents(raw: string | undefined): number {
  if (!raw) return 0;
  const normalized = /\.\d{3}/.test(raw)
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function parseDate(low: string, today: string): string {
  if (/anteontem/.test(low)) return addDays(today, -2);
  if (/ontem/.test(low)) return addDays(today, -1);
  const day = Number(low.match(/dia (\d{1,2})/)?.[1]);
  if (day >= 1 && day <= 31) {
    let month = today.slice(0, 7);
    let date = `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
    if (date > today) {
      month = addMonths(month, -1);
      date = `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
    }
    return date;
  }
  return today;
}

function describe(low: string, amountToken: string | undefined): string {
  const withoutAmount = amountToken ? low.replace(amountToken, ' ') : low;
  const kept = withoutAmount
    .replace(/dia \d{1,2}/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !FILLER.has(word));
  if (kept.length === 0) return '';
  const [first, ...rest] = kept.map((word) => BRANDS[word] ?? word);
  const head = BRANDS[kept[0]]
    ? first
    : first.charAt(0).toUpperCase() + first.slice(1);
  return [head, ...rest].join(' ');
}

/** Parser heurístico (porta do mock do design; LLM entra depois). */
export function parseTransactionText(
  text: string,
  today: string,
): ParsedTransaction {
  const low = text.toLowerCase().trim();
  const amountMatch = low.match(AMOUNT);
  const type = INCOME_TRIGGER.test(low) ? 'income' : 'expense';
  const hints = type === 'income' ? INCOME_HINTS : EXPENSE_HINTS;
  const categoryKey =
    hints.find(([pattern]) => pattern.test(low))?.[1] ??
    (type === 'income' ? 'sal' : 'out');

  return {
    type,
    amountCents: parseAmountCents(amountMatch?.[1]),
    description:
      describe(low, amountMatch?.[0]) ||
      (findCategory(categoryKey)?.name ?? ''),
    categoryKey,
    date: parseDate(low, today),
  };
}
