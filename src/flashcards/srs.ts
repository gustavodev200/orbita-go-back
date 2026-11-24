/**
 * Repetição espaçada no estilo Anki (SM-2 simplificado).
 *
 * - Card novo passa por passos curtos (1 min → 10 min) até "formar".
 * - Formado, o intervalo em dias cresce pelo fator de facilidade (ease).
 * - "Esqueci" num card formado derruba a facilidade e volta para reaprender.
 */

export const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type Rating = (typeof RATINGS)[number];

export const SRS_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export type SrsState = (typeof SRS_STATES)[number];

export interface SrsCard {
  srsState: SrsState;
  srsStep: number;
  ease: number;
  intervalDays: number;
  lapses: number;
}

export interface Scheduled extends SrsCard {
  dueAt: Date;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

/** Passos (em minutos) de quem está aprendendo / reaprendendo. */
const LEARNING_STEPS = [1, 10];
const RELEARNING_STEPS = [10];
const GRADUATING_DAYS = 1;
const EASY_DAYS = 4;
const START_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_DAYS = 3650;
/** Fração do intervalo que sobra depois de esquecer um card formado. */
const LAPSE_FACTOR = 0.5;

export const DEFAULT_SRS: SrsCard = {
  srsState: 'new',
  srsStep: 0,
  ease: START_EASE,
  intervalDays: 0,
  lapses: 0,
};

const clampDays = (days: number) =>
  Math.min(MAX_DAYS, Math.max(1, Math.round(days)));
const round2 = (n: number) => Math.round(n * 100) / 100;

const inMinutes = (now: Date, minutes: number) =>
  new Date(now.getTime() + Math.round(minutes) * MINUTE);
const inDays = (now: Date, days: number) =>
  new Date(now.getTime() + days * DAY);

/** Card dentro de passos curtos (aprendendo ou reaprendendo). */
function scheduleSteps(
  card: SrsCard,
  rating: Rating,
  now: Date,
  relearning: boolean,
): Scheduled {
  const steps = relearning ? RELEARNING_STEPS : LEARNING_STEPS;
  const state: SrsState = relearning ? 'relearning' : 'learning';
  const step =
    card.srsState === 'new' ? 0 : Math.min(card.srsStep, steps.length - 1);

  const stay = (nextStep: number, minutes: number): Scheduled => ({
    ...card,
    srsState: state,
    srsStep: nextStep,
    dueAt: inMinutes(now, minutes),
  });
  const graduate = (days: number): Scheduled => ({
    ...card,
    srsState: 'review',
    srsStep: 0,
    intervalDays: days,
    dueAt: inDays(now, days),
  });

  switch (rating) {
    case 'again':
      return stay(0, steps[0]);
    case 'hard': {
      // Como no Anki: no 1º passo, média dos dois primeiros; com um passo só, 1,5×.
      const minutes =
        step === 0 && steps.length > 1
          ? (steps[0] + steps[1]) / 2
          : steps.length === 1
            ? steps[0] * 1.5
            : steps[step];
      return stay(step, minutes);
    }
    case 'good':
      if (step + 1 < steps.length) return stay(step + 1, steps[step + 1]);
      return graduate(
        relearning ? clampDays(card.intervalDays) : GRADUATING_DAYS,
      );
    case 'easy':
      return graduate(
        relearning ? clampDays(card.intervalDays + 1) : EASY_DAYS,
      );
  }
}

/** Card formado: intervalo em dias multiplicado pela facilidade. */
function scheduleReview(card: SrsCard, rating: Rating, now: Date): Scheduled {
  const interval = Math.max(1, card.intervalDays);
  const ease = card.ease;

  if (rating === 'again') {
    return {
      ...card,
      srsState: 'relearning',
      srsStep: 0,
      ease: round2(Math.max(MIN_EASE, ease - 0.2)),
      intervalDays: clampDays(interval * LAPSE_FACTOR),
      lapses: card.lapses + 1,
      dueAt: inMinutes(now, RELEARNING_STEPS[0]),
    };
  }

  const hard = clampDays(Math.max(interval + 1, interval * 1.2));
  const good = clampDays(Math.max(hard + 1, interval * ease));
  const easy = clampDays(Math.max(good + 1, interval * ease * 1.3));

  const [days, nextEase] =
    rating === 'hard'
      ? [hard, Math.max(MIN_EASE, ease - 0.15)]
      : rating === 'good'
        ? [good, ease]
        : [easy, ease + 0.15];

  return {
    ...card,
    srsState: 'review',
    srsStep: 0,
    ease: round2(nextEase),
    intervalDays: days,
    dueAt: inDays(now, days),
  };
}

export function schedule(card: SrsCard, rating: Rating, now: Date): Scheduled {
  switch (card.srsState) {
    case 'review':
      return scheduleReview(card, rating, now);
    case 'relearning':
      return scheduleSteps(card, rating, now, true);
    default:
      return scheduleSteps(card, rating, now, false);
  }
}

/** Em quantos minutos o card volta para cada botão — o texto embaixo de cada um. */
export function previewMinutes(
  card: SrsCard,
  now: Date,
): Record<Rating, number> {
  const minutes = (rating: Rating) =>
    Math.round(
      (schedule(card, rating, now).dueAt.getTime() - now.getTime()) / MINUTE,
    );
  return {
    again: minutes('again'),
    hard: minutes('hard'),
    good: minutes('good'),
    easy: minutes('easy'),
  };
}
