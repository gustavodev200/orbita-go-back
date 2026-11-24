import { YearStatsBuilder } from './year-stats';

describe('YearStatsBuilder', () => {
  it('cria um balde por ano, em ordem, inclusive anos vazios', () => {
    const years = new YearStatsBuilder(2024, 2026).build();
    expect(years.map((y) => y.year)).toEqual([2024, 2025, 2026]);
    expect(years[1].tasksDone).toBe(0);
  });

  it('soma no ano do dia e ignora anos fora do intervalo', () => {
    const b = new YearStatsBuilder(2025, 2026);
    b.add('tasksDone', '2025-03-01');
    b.add('tasksDone', '2025-12-31');
    b.add('incomeCents', '2026-01-10', 5000);
    b.add('tasksDone', '2023-01-01');
    const [y25, y26] = b.build();
    expect(y25.tasksDone).toBe(2);
    expect(y26.incomeCents).toBe(5000);
  });
});
