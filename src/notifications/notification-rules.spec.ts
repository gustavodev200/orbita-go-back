import {
  buildSignals,
  groupPush,
  isQuietTime,
  type Snapshot,
} from './notification-rules';

// 2026-11-20 é sexta-feira (weekday 5); 2026-11-22 é domingo.
const NOW = new Date('2026-11-20T15:00:00.000Z'); // 12:00 em São Paulo

function snap(partial: Partial<Snapshot> = {}): Snapshot {
  return {
    today: '2026-11-20',
    nowTime: '12:00',
    now: NOW,
    digestTime: '08:00',
    tasks: [],
    objectives: [],
    goals: [],
    habits: [],
    challenges: [],
    bills: [],
    flashcardsDue: 0,
    week: null,
    ...partial,
  };
}

const keys = (s: Snapshot) => buildSignals(s).map((x) => x.key);
const byKind = (s: Snapshot, kind: string) =>
  buildSignals(s).filter((x) => x.kind === kind);

describe('buildSignals — tarefas', () => {
  it('sem nada pendente não gera nada (nem resumo)', () => {
    expect(buildSignals(snap())).toEqual([]);
  });

  it('prioritária atrasada vira urgente individual com push', () => {
    const [s] = byKind(
      snap({
        tasks: [
          {
            id: 't1',
            title: 'Relatório',
            dueDate: '2026-11-19',
            priority: 'high',
          },
        ],
      }),
      'task_overdue',
    );
    expect(s).toMatchObject({
      key: 'task-overdue:t1',
      severity: 'urgent',
      push: true,
      entityId: 't1',
    });
    expect(s.body).toContain('Venceu ontem');
  });

  it('várias atrasadas comuns viram UM alerta agrupado com key estável', () => {
    const tasks = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      id,
      title: `T${id}`,
      dueDate: '2026-11-15',
      priority: 'medium' as const,
    }));
    const overdue = byKind(snap({ tasks }), 'task_overdue');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({
      key: 'tasks-overdue',
      title: 'Você tem 5 tarefas atrasadas',
      entityId: null,
    });
    expect(overdue[0].body).toContain('e mais 2');
  });

  it('uma atrasada comum usa a mesma key do grupo (sem novo push ao variar a contagem)', () => {
    const [s] = byKind(
      snap({
        tasks: [
          { id: 'a', title: 'Lavar', dueDate: '2026-11-18', priority: 'low' },
        ],
      }),
      'task_overdue',
    );
    expect(s.key).toBe('tasks-overdue');
    expect(s.entityId).toBe('a');
  });

  it('tarefa de hoje é informativa; prioritária vira aviso após 17h', () => {
    const tasks = [
      {
        id: 'h',
        title: 'Prova',
        dueDate: '2026-11-20',
        priority: 'high' as const,
      },
      {
        id: 'm',
        title: 'Mercado',
        dueDate: '2026-11-20',
        priority: 'medium' as const,
      },
    ];
    expect(keys(snap({ tasks, nowTime: '12:00' }))).toEqual(
      expect.arrayContaining(['tasks-today:2026-11-20']),
    );
    expect(
      byKind(snap({ tasks, nowTime: '12:00' }), 'task_due_today'),
    ).toHaveLength(0);
    const late = byKind(snap({ tasks, nowTime: '17:30' }), 'task_due_today');
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ entityId: 'h', push: true });
  });

  it('tarefa sem prazo nunca notifica', () => {
    expect(
      byKind(
        snap({
          tasks: [{ id: 'x', title: 'x', dueDate: null, priority: 'high' }],
        }),
        'task_overdue',
      ),
    ).toHaveLength(0);
  });
});

describe('buildSignals — metas', () => {
  const base = {
    id: 'o1',
    title: 'Inglês',
    deadline: null,
    completedAt: null,
    progress: 40,
    lastActivityAt: NOW,
  };

  it('prazo vencido é urgente', () => {
    const [s] = buildSignals(
      snap({ objectives: [{ ...base, deadline: '2026-11-10' }] }),
    );
    expect(s).toMatchObject({
      kind: 'objective_overdue',
      severity: 'urgent',
      push: true,
    });
  });

  it('prazo em até 3 dias é importante', () => {
    const [s] = buildSignals(
      snap({ objectives: [{ ...base, deadline: '2026-11-22' }] }),
    );
    expect(s.kind).toBe('objective_due_soon');
    expect(s.body).toContain('vence em 2 dias');
  });

  it('sem progresso há 7+ dias gera alerta sem push', () => {
    const [s] = buildSignals(
      snap({
        objectives: [
          { ...base, lastActivityAt: new Date('2026-11-10T12:00:00Z') },
        ],
      }),
    );
    expect(s).toMatchObject({ kind: 'objective_stale', push: false });
  });

  it('concluída recentemente comemora; antiga não', () => {
    expect(
      byKind(
        snap({
          objectives: [
            { ...base, completedAt: new Date('2026-11-19T12:00:00Z') },
          ],
        }),
        'objective_done',
      ),
    ).toHaveLength(1);
    expect(
      buildSignals(
        snap({
          objectives: [
            { ...base, completedAt: new Date('2026-10-01T12:00:00Z') },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe('buildSignals — hábitos e desafios', () => {
  const habit = {
    id: 'h1',
    name: 'Ler',
    weekdays: [5],
    reminderTime: null,
    checkedToday: false,
  };

  it('só lembra à noite e só do que ainda não foi feito', () => {
    expect(byKind(snap({ habits: [habit] }), 'habit_pending')).toHaveLength(0);
    expect(
      byKind(snap({ habits: [habit], nowTime: '19:30' }), 'habit_pending'),
    ).toHaveLength(1);
    expect(
      byKind(
        snap({ habits: [{ ...habit, checkedToday: true }], nowTime: '19:30' }),
        'habit_pending',
      ),
    ).toHaveLength(0);
  });

  it('não antecipa hábito com lembrete mais tarde nem de outro dia da semana', () => {
    expect(
      byKind(
        snap({
          habits: [{ ...habit, reminderTime: '21:00' }],
          nowTime: '19:30',
        }),
        'habit_pending',
      ),
    ).toHaveLength(0);
    expect(
      byKind(
        snap({ habits: [{ ...habit, weekdays: [1] }], nowTime: '19:30' }),
        'habit_pending',
      ),
    ).toHaveLength(0);
  });

  it('desafio sem check-in à noite gera aviso', () => {
    const [s] = buildSignals(
      snap({
        challenges: [{ id: 'c1', title: '21 dias', checkedToday: false }],
        nowTime: '20:00',
      }),
    );
    expect(s).toMatchObject({
      key: 'challenge-checkin:c1:2026-11-20',
      entityId: 'c1',
    });
  });
});

describe('buildSignals — contas', () => {
  const bill = { id: 'b1', description: 'Luz', amountCents: 15000 };

  it('classifica atrasada / hoje / em breve', () => {
    const s = snap({
      bills: [
        { ...bill, dueDate: '2026-11-18' },
        { ...bill, id: 'b2', dueDate: '2026-11-20' },
        { ...bill, id: 'b3', dueDate: '2026-11-22' },
        { ...bill, id: 'b4', dueDate: '2026-11-30' },
      ],
    });
    expect(buildSignals(s).map((x) => [x.kind, x.severity])).toEqual([
      ['bill_overdue', 'urgent'],
      ['bill_due', 'important'],
      ['bill_soon', 'info'],
      ['daily_digest', 'info'],
    ]);
  });
});

describe('buildSignals — resumo diário e semanal', () => {
  it('resumo só depois do horário configurado', () => {
    const tasks = [
      { id: 'a', title: 'a', dueDate: '2026-11-19', priority: 'low' as const },
    ];
    expect(
      byKind(snap({ tasks, nowTime: '07:00' }), 'daily_digest'),
    ).toHaveLength(0);
    const [d] = byKind(snap({ tasks, flashcardsDue: 3 }), 'daily_digest');
    expect(d.body).toBe('1 tarefa atrasada · 3 cards para revisar.');
    expect(d.push).toBe(true);
  });

  it('resumo semanal no domingo à noite', () => {
    const sunday = snap({
      today: '2026-11-22',
      nowTime: '18:30',
      week: { tasksDone: 4, habitChecks: 1 },
    });
    const [w] = byKind(sunday, 'weekly_review');
    expect(w.body).toContain('4 tarefas concluídas e 1 check-in de hábito');
  });
});

describe('push', () => {
  it('silêncio entre 22h e 7h', () => {
    expect(isQuietTime('23:10')).toBe(true);
    expect(isQuietTime('06:59')).toBe(true);
    expect(isQuietTime('07:00')).toBe(false);
    expect(isQuietTime('21:59')).toBe(false);
  });

  it('agrupa vários alertas num push só', () => {
    const one = {
      key: 'k1',
      title: 'A',
      body: 'a',
      url: '/x',
      severity: 'important' as const,
    };
    expect(groupPush([])).toBeNull();
    expect(groupPush([one])).toEqual({
      title: 'A',
      body: 'a',
      url: '/x',
      tag: 'notif-k1',
    });
    const many = groupPush([
      one,
      { ...one, key: 'k2', title: 'B', severity: 'urgent' },
      { ...one, key: 'k3', title: 'C' },
    ]);
    expect(many).toMatchObject({
      title: '3 alertas · 1 urgente',
      url: '/notificacoes',
      tag: 'notif-group',
    });
    expect(many?.body).toBe('A, B e mais 1');
  });
});
