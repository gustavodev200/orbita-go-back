import { DEFAULT_SRS, previewMinutes, schedule, type SrsCard } from './srs';

const now = new Date('2026-11-24T12:00:00Z');
const DAY_MIN = 1440;

describe('srs.previewMinutes', () => {
  it('card novo: 1 min / 6 min / 10 min / 4 dias', () => {
    expect(previewMinutes(DEFAULT_SRS, now)).toEqual({
      again: 1,
      hard: 6,
      good: 10,
      easy: 4 * DAY_MIN,
    });
  });

  it('no último passo de aprendizado, "Lembrei" forma o card em 1 dia', () => {
    const learning: SrsCard = {
      ...DEFAULT_SRS,
      srsState: 'learning',
      srsStep: 1,
    };
    expect(previewMinutes(learning, now)).toEqual({
      again: 1,
      hard: 10,
      good: DAY_MIN,
      easy: 4 * DAY_MIN,
    });
  });

  it('card formado cresce pelo fator de facilidade', () => {
    const review: SrsCard = {
      ...DEFAULT_SRS,
      srsState: 'review',
      intervalDays: 10,
    };
    expect(previewMinutes(review, now)).toEqual({
      again: 10,
      hard: 12 * DAY_MIN,
      good: 25 * DAY_MIN,
      easy: 33 * DAY_MIN,
    });
  });
});

describe('srs.schedule', () => {
  it('esquecer card formado: reaprende, perde facilidade e metade do intervalo', () => {
    const review: SrsCard = {
      ...DEFAULT_SRS,
      srsState: 'review',
      intervalDays: 10,
    };
    const next = schedule(review, 'again', now);
    expect(next).toMatchObject({
      srsState: 'relearning',
      ease: 2.3,
      intervalDays: 5,
      lapses: 1,
    });
    // Reaprendido, volta com o intervalo reduzido.
    const back = schedule(next, 'good', now);
    expect(back).toMatchObject({ srsState: 'review', intervalDays: 5 });
  });

  it('facilidade nunca cai abaixo de 1,3', () => {
    const review: SrsCard = {
      ...DEFAULT_SRS,
      srsState: 'review',
      intervalDays: 3,
      ease: 1.35,
    };
    expect(schedule(review, 'hard', now).ease).toBe(1.3);
  });

  it('sequência de "Lembrei" espaça cada vez mais', () => {
    let card: SrsCard = DEFAULT_SRS;
    const days: number[] = [];
    for (let i = 0; i < 5; i++) {
      card = schedule(card, 'good', now);
      days.push(card.intervalDays);
    }
    expect(days).toEqual([0, 1, 3, 8, 20]);
  });
});
