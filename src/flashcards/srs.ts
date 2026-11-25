/**
 * Repetição espaçada no padrão SM-2 / Anki, com fase de aprendizado em minutos.
 *
 * - Card novo passa por LEARNING_STEPS revisões curtas antes de ir para dias:
 *   3× Esqueci 1 min · Difícil 3 min · Lembrei 5 min · Fácil 10 min, depois
 *   3× Esqueci 5 min · Difícil 1 h · Lembrei 3 h · Fácil 10 h.
 * - Formado, o card é tratado como se o intervalo atual fosse 1 dia:
 *   Esqueci 1 dia · Difícil 2 · Lembrei 3 · Fácil 4.
 * - Depois o intervalo cresce: Difícil ×1,2 · Lembrei × facilidade (2,5) ·
 *   Fácil × facilidade × 1,3 — cada botão sempre pelo menos 1 dia além do anterior.
 * - "Esqueci" num card já aprendido volta para 1 dia e reduz a facilidade.
 * - O card vence às 4h do dia marcado (fuso de negócio), como o Anki: estudar
 *   de madrugada ainda conta como o dia anterior.
 */
import {
  addDays,
  BUSINESS_UTC_OFFSET,
  businessDay,
} from '../common/time/business-time';

export const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type Rating = (typeof RATINGS)[number];

/** learning = card novo nas revisões em minutos; relearning = aprendido e esquecido. */
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

const START_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_DAYS = 3650;
/** Hora em que o "dia de estudo" vira. */
const DAY_ROLLOVER_HOUR = 4;
const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY_MINUTES = 1440;

/** Fase de aprendizado: minutos por botão, cada linha vale para uma revisão. */
const PHASE_1: Record<Rating, number> = {
  again: 1,
  hard: 3,
  good: 5,
  easy: 10,
};
const PHASE_2: Record<Rating, number> = {
  again: 5,
  hard: 60,
  good: 180,
  easy: 600,
};
export const LEARNING_STEPS: Record<Rating, number>[] = [
  PHASE_1,
  PHASE_1,
  PHASE_1,
  PHASE_2,
  PHASE_2,
  PHASE_2,
];

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

/** Dia de estudo (YYYY-MM-DD) do instante — antes das 4h ainda é o dia anterior. */
export function studyDay(now: Date): string {
  return businessDay(new Date(now.getTime() - DAY_ROLLOVER_HOUR * HOUR));
}

/** Início (4h) do dia de estudo `days` dias depois do atual. */
export function studyDayStart(now: Date, days = 0): Date {
  const hh = String(DAY_ROLLOVER_HOUR).padStart(2, '0');
  return new Date(
    `${addDays(studyDay(now), days)}T${hh}:00:00${BUSINESS_UTC_OFFSET}`,
  );
}

const isLearned = (card: SrsCard) =>
  card.srsState === 'review' || card.srsState === 'relearning';

/** Card ainda nas revisões em minutos: retorna o passo atual, senão null. */
function learningStep(card: SrsCard): Record<Rating, number> | null {
  if (isLearned(card)) return null;
  return LEARNING_STEPS[Math.max(0, card.srsStep)] ?? null;
}

/** Em quantos minutos o card volta para cada botão — o texto embaixo de cada um. */
export function nextIntervalMinutes(card: SrsCard): Record<Rating, number> {
  const step = learningStep(card);
  if (step) return { ...step };
  const days = nextIntervals(card);
  return {
    again: days.again * DAY_MINUTES,
    hard: days.hard * DAY_MINUTES,
    good: days.good * DAY_MINUTES,
    easy: days.easy * DAY_MINUTES,
  };
}

/** Intervalo em dias depois que o card sai da fase em minutos. */
export function nextIntervals(card: SrsCard): Record<Rating, number> {
  const current = isLearned(card) ? Math.max(1, card.intervalDays) : 1;
  const hard = clampDays(Math.max(current + 1, current * 1.2));
  const good = clampDays(Math.max(hard + 1, current * card.ease));
  const easy = clampDays(Math.max(good + 1, current * card.ease * 1.3));
  return { again: 1, hard, good, easy };
}

export function schedule(card: SrsCard, rating: Rating, now: Date): Scheduled {
  const step = learningStep(card);
  if (step) {
    const nextStep = Math.max(0, card.srsStep) + 1;
    return {
      // Depois do último passo o card se forma: a próxima resposta já é em dias.
      srsState: nextStep >= LEARNING_STEPS.length ? 'review' : 'learning',
      srsStep: nextStep >= LEARNING_STEPS.length ? 0 : nextStep,
      ease: card.ease,
      intervalDays: 0,
      lapses: card.lapses,
      dueAt: new Date(now.getTime() + step[rating] * MINUTE),
    };
  }

  const days = nextIntervals(card)[rating];
  // Facilidade só muda em card já aprendido (errar palavra nova é normal).
  const inReview = card.srsState === 'review';
  const delta = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 }[rating];
  const ease = inReview
    ? round2(Math.max(MIN_EASE, card.ease + delta))
    : card.ease;

  return {
    srsState: rating !== 'again' ? 'review' : 'relearning',
    srsStep: 0,
    ease,
    intervalDays: days,
    lapses: card.lapses + (rating === 'again' && inReview ? 1 : 0),
    dueAt: studyDayStart(now, days),
  };
}
