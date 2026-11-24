import {
  challengeEndDate,
  challengeStatus,
  missedDays,
} from './challenge-status';

const base = {
  startDate: '2026-11-10',
  durationDays: 7,
  completed: false,
  abandoned: false,
};

describe('challengeEndDate', () => {
  it('7 dias a partir de 10/11 terminam em 16/11', () => {
    expect(challengeEndDate('2026-11-10', 7)).toBe('2026-11-16');
  });
});

describe('challengeStatus', () => {
  it('antes do início → upcoming', () => {
    expect(challengeStatus(base, '2026-11-09')).toBe('upcoming');
  });

  it('do início até o último dia → active', () => {
    expect(challengeStatus(base, '2026-11-10')).toBe('active');
    expect(challengeStatus(base, '2026-11-16')).toBe('active');
  });

  it('depois do fim sem completar → ended', () => {
    expect(challengeStatus(base, '2026-11-17')).toBe('ended');
  });

  it('completo vence o prazo; desistência vence tudo', () => {
    expect(challengeStatus({ ...base, completed: true }, '2026-11-12')).toBe(
      'completed',
    );
    expect(
      challengeStatus(
        { ...base, completed: true, abandoned: true },
        '2026-11-12',
      ),
    ).toBe('abandoned');
  });
});

describe('missedDays', () => {
  it('conta só dias anteriores a hoje sem check-in', () => {
    const checked = new Set(['2026-11-10', '2026-11-12']);
    // 10 ✓, 11 ✗, 12 ✓, 13 = hoje (não conta)
    expect(missedDays('2026-11-10', 7, checked, '2026-11-13')).toBe(1);
  });

  it('não passa do último dia do desafio', () => {
    expect(missedDays('2026-11-10', 7, new Set(), '2026-12-01')).toBe(7);
  });
});
