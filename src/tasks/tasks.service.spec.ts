import type { PrismaService, Tx } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

describe('TasksService — sincronização com Reminder', () => {
  const baseTask = {
    id: 't1',
    userId: 'u1',
    title: 'Ligar pro dentista',
    dueDate: new Date('2026-10-01T00:00:00.000Z'),
    priority: 'medium' as const,
    reminderAt: null as string | null,
    done: false,
    doneAt: null,
    xpAwarded: false,
    status: 'todo' as 'backlog' | 'todo' | 'doing' | 'done',
    position: 1,
    objectiveId: null as string | null,
    createdAt: new Date(),
  };

  function buildTx(taskOverrides: Partial<typeof baseTask> = {}) {
    const task = { ...baseTask, ...taskOverrides };
    const tx = {
      task: {
        create: jest.fn().mockResolvedValue(task),
        update: jest.fn().mockResolvedValue(task),
        findFirst: jest.fn().mockResolvedValue(task),
        delete: jest.fn().mockResolvedValue(task),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _max: { position: 4 }, _min: { position: -2 } }),
      },
      reminder: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return { tx, task };
  }

  function buildPrisma(tx: unknown): PrismaService {
    return {
      transaction: (fn: (tx: Tx) => unknown) => fn(tx as Tx),
    } as unknown as PrismaService;
  }

  const gamification = { award: jest.fn() };

  it('cria a task com lembrete e faz upsert do Reminder (kind=task, repeat=none)', async () => {
    const { tx } = buildTx({ reminderAt: '2026-10-01T09:00:00-03:00' });
    const service = new TasksService(buildPrisma(tx), gamification as never);

    await service.create('u1', {
      title: 'Ligar pro dentista',
      priority: 'medium',
      reminderAt: '2026-10-01T09:00:00-03:00',
    });

    expect(tx.reminder.upsert).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      create: expect.objectContaining({
        userId: 'u1',
        taskId: 't1',
        kind: 'task',
        repeat: 'none',
        time: '09:00',
        enabled: true,
      }),
      update: expect.objectContaining({ time: '09:00', enabled: true }),
    });
  });

  it('não cria Reminder quando a task não tem lembrete', async () => {
    const { tx } = buildTx({ reminderAt: null });
    const service = new TasksService(buildPrisma(tx), gamification as never);

    await service.create('u1', { title: 'Sem lembrete', priority: 'low' });

    expect(tx.reminder.upsert).not.toHaveBeenCalled();
    expect(tx.reminder.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
    });
  });

  it('remove o Reminder ao limpar reminderAt na edição', async () => {
    const { tx } = buildTx({ reminderAt: null });
    const service = new TasksService(buildPrisma(tx), gamification as never);

    await service.update('u1', 't1', {
      title: 'Ligar pro dentista',
      priority: 'medium',
      reminderAt: null,
    });

    expect(tx.reminder.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
    });
    expect(tx.reminder.upsert).not.toHaveBeenCalled();
  });

  it('não mexe no Reminder quando reminderAt e title não são tocados', async () => {
    const { tx } = buildTx();
    const service = new TasksService(buildPrisma(tx), gamification as never);

    await service.update('u1', 't1', { priority: 'high' });

    expect(tx.reminder.upsert).not.toHaveBeenCalled();
    expect(tx.reminder.deleteMany).not.toHaveBeenCalled();
  });

  it('desliga o Reminder ao concluir a task (sem apagar)', async () => {
    const { tx } = buildTx({
      reminderAt: '2026-10-01T09:00:00-03:00',
      done: false,
    });
    const service = new TasksService(buildPrisma(tx), gamification as never);

    await service.complete('u1', 't1');

    expect(tx.reminder.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { enabled: false },
    });
  });

  it('religa o Reminder ao desmarcar a conclusão', async () => {
    const { tx } = buildTx({
      reminderAt: '2026-10-01T09:00:00-03:00',
      done: true,
    });
    const service = new TasksService(buildPrisma(tx), gamification as never);

    await service.uncomplete('u1', 't1');

    expect(tx.reminder.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { enabled: true },
    });
  });

  describe('move (quadro Kanban)', () => {
    beforeEach(() => gamification.award.mockReset());

    it('mover para "done" conclui, desliga lembrete e dá XP na 1ª vez', async () => {
      const { tx } = buildTx({ status: 'doing', done: false });
      gamification.award.mockResolvedValue({ xp: 10 });
      const service = new TasksService(buildPrisma(tx), gamification as never);

      const res = await service.move('u1', 't1', { status: 'done' });

      expect(tx.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({
          status: 'done',
          position: -3,
          done: true,
          xpAwarded: true,
        }),
      });
      expect(tx.reminder.updateMany).toHaveBeenCalledWith({
        where: { taskId: 't1' },
        data: { enabled: false },
      });
      expect(res.reward).toEqual({ xp: 10 });
    });

    it('reconcluir tarefa que já pagou XP não dá XP de novo', async () => {
      const { tx } = buildTx({ status: 'todo', done: false, xpAwarded: true });
      const service = new TasksService(buildPrisma(tx), gamification as never);

      const res = await service.move('u1', 't1', { status: 'done' });

      expect(gamification.award).not.toHaveBeenCalled();
      expect(res.reward).toBeNull();
    });

    it('sair de "done" reabre e religa o lembrete', async () => {
      const { tx } = buildTx({ status: 'done', done: true });
      const service = new TasksService(buildPrisma(tx), gamification as never);

      await service.move('u1', 't1', { status: 'doing', position: 2.5 });

      expect(tx.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({
          status: 'doing',
          position: 2.5,
          done: false,
          doneAt: null,
        }),
      });
      expect(tx.reminder.updateMany).toHaveBeenCalledWith({
        where: { taskId: 't1' },
        data: { enabled: true },
      });
    });

    it('reordenar na mesma coluna não mexe em done nem no lembrete', async () => {
      const { tx } = buildTx({ status: 'todo' });
      const service = new TasksService(buildPrisma(tx), gamification as never);

      await service.move('u1', 't1', { status: 'todo', position: 0.5 });

      const data = (tx.task.update.mock.calls[0] as [{ data: object }])[0].data;
      expect(data).toEqual({ status: 'todo', position: 0.5 });
      expect(tx.reminder.updateMany).not.toHaveBeenCalled();
      expect(tx.task.aggregate).not.toHaveBeenCalled();
    });

    it('criar direto em "done" não dá XP', async () => {
      const { tx } = buildTx();
      const service = new TasksService(buildPrisma(tx), gamification as never);

      await service.create('u1', {
        title: 'x',
        priority: 'low',
        status: 'done',
      });

      expect(tx.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'done',
          done: true,
          xpAwarded: true,
          position: -3,
        }),
      });
      expect(gamification.award).not.toHaveBeenCalled();
    });
  });
});
