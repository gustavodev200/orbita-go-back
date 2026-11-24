import { monthlyTotals } from './transactions.service';

describe('monthlyTotals', () => {
  it('um balde por mês, inclusive vazios, somando por tipo', () => {
    const rows = [
      {
        type: 'income' as const,
        amountCents: 500000,
        date: new Date('2026-09-05T00:00:00Z'),
      },
      {
        type: 'expense' as const,
        amountCents: 12000,
        date: new Date('2026-09-30T00:00:00Z'),
      },
      {
        type: 'expense' as const,
        amountCents: 3000,
        date: new Date('2026-11-01T00:00:00Z'),
      },
    ];
    expect(monthlyTotals(rows, '2026-09', 3)).toEqual([
      { month: '2026-09', incomeCents: 500000, expenseCents: 12000 },
      { month: '2026-10', incomeCents: 0, expenseCents: 0 },
      { month: '2026-11', incomeCents: 0, expenseCents: 3000 },
    ]);
  });

  it('virada de ano e lançamentos fora da janela ignorados', () => {
    const rows = [
      {
        type: 'income' as const,
        amountCents: 100,
        date: new Date('2027-01-15T00:00:00Z'),
      },
      {
        type: 'income' as const,
        amountCents: 999,
        date: new Date('2026-06-01T00:00:00Z'),
      },
    ];
    const out = monthlyTotals(rows, '2026-12', 2);
    expect(out.map((m) => m.month)).toEqual(['2026-12', '2027-01']);
    expect(out[1].incomeCents).toBe(100);
    expect(out[0].incomeCents).toBe(0);
  });
});
