import {
  DEFAULT_SRS,
  nextIntervals,
  schedule,
  studyDay,
  studyDayStart,
  type SrsCard,
} from './srs';

// 10h em São Paulo.
const now = new Date('2026-11-24T13:00:00Z');

describe('srs.nextIntervals', () => {
  it('card novo: 1 / 2 / 3 / 4 dias', () => {
    expect(nextIntervals(DEFAULT_SRS)).toEqual({
      again: 1,
      hard: 2,
      good: 3,
      easy: 4,
    });
  });

  it('card aprendido cresce pela facilidade', () => {
    const review: SrsCard = {
      ...DEFAULT_SRS,
      srsState: 'review',
      intervalDays: 10,
    };
    expect(nextIntervals(review)).toEqual({
      again: 1,
      hard: 12,
      good: 25,
      easy: 33,
    });
  });
});

describe('srs.schedule', () => {
  it('vence às 4h do dia marcado, no fuso de São Paulo', () => {
    const next = schedule(DEFAULT_SRS, 'good', now);
    expect(next.dueAt.toISOString()).toBe('2026-11-27T07:00:00.000Z');
    expect(next).toMatchObject({ srsState: 'review', intervalDays: 3 });
  });

  it('"Esqueci" em card novo: amanhã, sem mexer na facilidade', () => {
    const next = schedule(DEFAULT_SRS, 'again', now);
    expect(next).toMatchObject({
      srsState: 'learning',
      intervalDays: 1,
      ease: 2.5,
      lapses: 0,
    });
    expect(next.dueAt.toISOString()).toBe('2026-11-25T07:00:00.000Z');
  });

  it('"Esqueci" em card aprendido: volta para 1 dia e perde facilidade', () => {
    const review: SrsCard = {
      ...DEFAULT_SRS,
      srsState: 'review',
      intervalDays: 20,
    };
    const next = schedule(review, 'again', now);
    expect(next).toMatchObject({
      srsState: 'relearning',
      intervalDays: 1,
      ease: 2.3,
      lapses: 1,
    });
    expect(schedule(next, 'good', now)).toMatchObject({
      srsState: 'review',
      intervalDays: 3,
    });
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
    expect(days).toEqual([3, 8, 20, 50, 125]);
  });
});

describe('srs.studyDay', () => {
  it('de madrugada (antes das 4h) ainda é o dia anterior', () => {
    // 02h de 25/11 em São Paulo.
    const lateNight = new Date('2026-11-25T05:00:00Z');
    expect(studyDay(lateNight)).toBe('2026-11-24');
    expect(studyDayStart(lateNight).toISOString()).toBe(
      '2026-11-24T07:00:00.000Z',
    );
  });
});
