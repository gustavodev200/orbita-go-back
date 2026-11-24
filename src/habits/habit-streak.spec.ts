import { habitBestStreak, habitStreak } from './habit-streak';

const ALL = [0, 1, 2, 3, 4, 5, 6];
// 2026-11-20 é sexta-feira (weekday 5).
const FRI = '2026-11-20';

describe('habitStreak', () => {
  it('diário marcado hoje, ontem e anteontem → 3', () => {
    const checks = new Set(['2026-11-20', '2026-11-19', '2026-11-18']);
    expect(habitStreak(ALL, checks, FRI)).toBe(3);
  });

  it('hoje ainda não marcado não zera: conta a partir de ontem', () => {
    const checks = new Set(['2026-11-19', '2026-11-18']);
    expect(habitStreak(ALL, checks, FRI)).toBe(2);
  });

  it('pula dias não agendados (seg/qua/sex)', () => {
    const checks = new Set(['2026-11-20', '2026-11-18', '2026-11-16']);
    expect(habitStreak([1, 3, 5], checks, FRI)).toBe(3);
  });

  it('um dia agendado sem marcação interrompe', () => {
    const checks = new Set(['2026-11-20', '2026-11-18']);
    expect(habitStreak(ALL, checks, FRI)).toBe(1);
  });

  it('nada marcado → 0', () => {
    expect(habitStreak(ALL, new Set(), FRI)).toBe(0);
  });
});

describe('habitBestStreak', () => {
  const FROM = '2026-11-01';

  it('maior sequência no meio do período, não a atual', () => {
    const checks = new Set([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-19',
      '2026-11-20',
    ]);
    expect(habitBestStreak(ALL, checks, FROM, FRI)).toBe(4);
  });

  it('pula dias não agendados (seg/qua/sex)', () => {
    const checks = new Set(['2026-11-16', '2026-11-18', '2026-11-20']);
    expect(habitBestStreak([1, 3, 5], checks, FROM, FRI)).toBe(3);
  });

  it('hoje não marcado não quebra a sequência em curso', () => {
    const checks = new Set(['2026-11-18', '2026-11-19']);
    expect(habitBestStreak(ALL, checks, FROM, FRI)).toBe(2);
  });

  it('nada marcado → 0', () => {
    expect(habitBestStreak(ALL, new Set(), FROM, FRI)).toBe(0);
  });
});
