import {
  occurrencesBetween,
  occurrencesInMonth,
  periodKey,
  pickOccurrence,
  recurringStatus,
  type Schedule,
} from './recurring-schedule';

const monthly = (dueDay: number, extra: Partial<Schedule> = {}): Schedule => ({
  frequency: 'monthly',
  dueDay,
  startDate: '2026-01-01',
  endDate: null,
  ...extra,
});

describe('recurring-schedule', () => {
  describe('occurrencesInMonth', () => {
    it('mensal vence no dia informado', () => {
      expect(occurrencesInMonth(monthly(5), '2026-10')).toEqual(['2026-10-05']);
    });

    it('mensal com dia 31 cai no último dia de meses curtos', () => {
      expect(occurrencesInMonth(monthly(31), '2026-02')).toEqual([
        '2026-02-28',
      ]);
    });

    it('não gera ocorrência antes do início nem depois do fim', () => {
      expect(
        occurrencesInMonth(monthly(5, { startDate: '2026-09-29' }), '2026-09'),
      ).toEqual([]);
      expect(
        occurrencesInMonth(monthly(5, { endDate: '2026-10-04' }), '2026-10'),
      ).toEqual([]);
    });

    it('anual só aparece no mês da data de início', () => {
      const yearly: Schedule = {
        frequency: 'yearly',
        dueDay: 14,
        startDate: '2026-03-01',
        endDate: null,
      };
      expect(occurrencesInMonth(yearly, '2027-03')).toEqual(['2027-03-14']);
      expect(occurrencesInMonth(yearly, '2027-04')).toEqual([]);
    });

    it('semanal gera todas as datas do dia da semana no mês', () => {
      const weekly: Schedule = {
        frequency: 'weekly',
        dueDay: 1, // segunda
        startDate: '2026-01-01',
        endDate: null,
      };
      expect(occurrencesInMonth(weekly, '2026-09')).toEqual([
        '2026-09-07',
        '2026-09-14',
        '2026-09-21',
        '2026-09-28',
      ]);
    });
  });

  it('occurrencesBetween cruza a virada de mês', () => {
    expect(occurrencesBetween(monthly(2), '2026-09-29', '2026-10-06')).toEqual([
      '2026-10-02',
    ]);
  });

  describe('recurringStatus', () => {
    it('pago vence qualquer data', () => {
      expect(recurringStatus('2026-09-01', true, '2026-09-29')).toBe('paid');
    });

    it('vencimento passado sem pagamento é atrasado', () => {
      expect(recurringStatus('2026-09-25', false, '2026-09-29')).toBe(
        'overdue',
      );
    });

    it('vence hoje ou no futuro é pendente', () => {
      expect(recurringStatus('2026-09-29', false, '2026-09-29')).toBe(
        'pending',
      );
      expect(recurringStatus('2026-10-05', false, '2026-09-29')).toBe(
        'pending',
      );
    });
  });

  it('periodKey por frequência', () => {
    expect(periodKey('monthly', '2026-10-05')).toBe('2026-10');
    expect(periodKey('yearly', '2026-10-05')).toBe('2026');
    expect(periodKey('weekly', '2026-10-05')).toBe('2026-10-05');
  });

  it('pickOccurrence escolhe a primeira não paga, senão a última', () => {
    const dates = ['2026-09-07', '2026-09-14'];
    expect(pickOccurrence('weekly', dates, new Set(['2026-09-07']))).toEqual({
      dueDate: '2026-09-14',
      period: '2026-09-14',
    });
    expect(
      pickOccurrence('weekly', dates, new Set(['2026-09-07', '2026-09-14'])),
    ).toEqual({ dueDate: '2026-09-14', period: '2026-09-14' });
    expect(pickOccurrence('monthly', [], new Set())).toBeNull();
  });
});
