export interface YearStats {
  year: number;
  tasksDone: number;
  habitChecks: number;
  objectivesDone: number;
  savingsGoalsDone: number;
  challengesDone: number;
  lifeEvents: number;
  incomeCents: number;
  expenseCents: number;
}

export type YearCounter = Exclude<keyof YearStats, 'year'>;

/** Baldes por ano, de `firstYear` até `lastYear` (inclusive), em ordem crescente. */
export class YearStatsBuilder {
  private readonly years = new Map<number, YearStats>();

  constructor(
    private readonly firstYear: number,
    private readonly lastYear: number,
  ) {
    for (let y = firstYear; y <= lastYear; y++) {
      this.years.set(y, {
        year: y,
        tasksDone: 0,
        habitChecks: 0,
        objectivesDone: 0,
        savingsGoalsDone: 0,
        challengesDone: 0,
        lifeEvents: 0,
        incomeCents: 0,
        expenseCents: 0,
      });
    }
  }

  /** Soma `amount` no ano do dia `day` (YYYY-MM-DD); anos fora do intervalo são ignorados. */
  add(counter: YearCounter, day: string, amount = 1): void {
    const bucket = this.years.get(Number(day.slice(0, 4)));
    if (bucket) bucket[counter] += amount;
  }

  build(): YearStats[] {
    return [...this.years.values()];
  }
}
