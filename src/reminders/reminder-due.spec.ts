import { isReminderDueOn, type ReminderSchedule } from './reminder-due';

const base: ReminderSchedule = {
  repeat: 'daily',
  dayOfMonth: null,
  weekday: null,
  date: null,
};

describe('isReminderDueOn', () => {
  it('diário é sempre devido', () => {
    expect(isReminderDueOn(base, '2026-09-29')).toBe(true);
    expect(isReminderDueOn(base, '2026-01-01')).toBe(true);
  });

  it('semanal só no dia da semana configurado', () => {
    // 2026-09-29 é terça (weekday 2)
    expect(
      isReminderDueOn({ ...base, repeat: 'weekly', weekday: 2 }, '2026-09-29'),
    ).toBe(true);
    expect(
      isReminderDueOn({ ...base, repeat: 'weekly', weekday: 5 }, '2026-09-29'),
    ).toBe(false);
  });

  it('semanal sem weekday definido nunca é devido', () => {
    expect(
      isReminderDueOn(
        { ...base, repeat: 'weekly', weekday: null },
        '2026-09-29',
      ),
    ).toBe(false);
  });

  it('mensal bate no dia configurado', () => {
    expect(
      isReminderDueOn(
        { ...base, repeat: 'monthly', dayOfMonth: 29 },
        '2026-09-29',
      ),
    ).toBe(true);
    expect(
      isReminderDueOn(
        { ...base, repeat: 'monthly', dayOfMonth: 5 },
        '2026-09-29',
      ),
    ).toBe(false);
  });

  it('mensal com dia 31 cai no último dia em meses curtos', () => {
    expect(
      isReminderDueOn(
        { ...base, repeat: 'monthly', dayOfMonth: 31 },
        '2026-02-28',
      ),
    ).toBe(true);
    expect(
      isReminderDueOn(
        { ...base, repeat: 'monthly', dayOfMonth: 31 },
        '2026-02-27',
      ),
    ).toBe(false);
  });

  it('mensal sem dayOfMonth nunca é devido', () => {
    expect(
      isReminderDueOn(
        { ...base, repeat: 'monthly', dayOfMonth: null },
        '2026-09-29',
      ),
    ).toBe(false);
  });

  it('único (repeat none) só na data exata', () => {
    expect(
      isReminderDueOn(
        { ...base, repeat: 'none', date: '2026-09-29' },
        '2026-09-29',
      ),
    ).toBe(true);
    expect(
      isReminderDueOn(
        { ...base, repeat: 'none', date: '2026-09-30' },
        '2026-09-29',
      ),
    ).toBe(false);
    expect(
      isReminderDueOn({ ...base, repeat: 'none', date: null }, '2026-09-29'),
    ).toBe(false);
  });
});
