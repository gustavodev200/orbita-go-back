import { buildHabitPayload, isHabitDue } from './habit-due';

// 2026-11-20 é sexta-feira (weekday 5).
const TODAY = '2026-11-20';
const base = { weekdays: [1, 3, 5], reminderTime: '08:00' };

describe('isHabitDue', () => {
  it('dispara: dentro da janela, dia agendado, não marcado e não avisado', () => {
    expect(isHabitDue(base, false, TODAY, '08:04', null)).toBe(true);
  });

  it('não dispara se o hábito já foi marcado hoje', () => {
    expect(isHabitDue(base, true, TODAY, '08:04', null)).toBe(false);
  });

  it('não dispara em dia não agendado', () => {
    expect(
      isHabitDue({ ...base, weekdays: [1] }, false, TODAY, '08:04', null),
    ).toBe(false);
  });

  it('não dispara de novo no mesmo dia', () => {
    expect(isHabitDue(base, false, TODAY, '08:04', TODAY)).toBe(false);
  });

  it('não dispara sem horário de lembrete', () => {
    expect(
      isHabitDue({ ...base, reminderTime: null }, false, TODAY, '08:04', null),
    ).toBe(false);
  });
});

describe('buildHabitPayload', () => {
  it('usa o nome como título e abre /habitos', () => {
    expect(
      buildHabitPayload({
        id: 'h1',
        name: 'Ler 10 páginas',
        reminderTime: '08:00',
      }),
    ).toEqual({
      title: 'Ler 10 páginas',
      body: 'Hábito de hoje · 08:00',
      url: '/habitos',
      tag: 'habit-h1',
    });
  });
});
