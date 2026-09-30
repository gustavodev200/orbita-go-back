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
    return { transaction: (fn: (tx: Tx) => unknown) => fn(tx as Tx) } as unknown as PrismaService;
  }

  const gamification = { award: jest.fn() };

  it('cria a task com lembrete e faz upsert do Reminder (kind=task, repeat=none)', async () => {
    const { tx } = buildTx({ reminderAt: '2026-10-01T09:00:00-03:00' });
    const service = new TasksService(
      buildPrisma(tx),
      gamification as never,
    );

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
    expect(tx.reminder.deleteMany).toHaveBeenCalledWith({ where: { taskId: 't1' } });
  });

  it('remove o Reminder ao limpar reminderAt na edição', async () => {
    const { tx } = buildTx({ reminderAt: null });
    const service = new TasksService(buildPrisma(tx), gamification as never);

    await service.update('u1', 't1', {
      title: 'Ligar pro dentista',
      priority: 'medium',
      reminderAt: null,
    });

    expect(tx.reminder.deleteMany).toHaveBeenCalledWith({ where: { taskId: 't1' } });
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
    const { tx } = buildTx({ reminderAt: '2026-10-01T09:00:00-03:00', done: false });
    const service = new TasksService(buildPrisma(tx), gamification as never);

    await service.complete('u1', 't1');

    expect(tx.reminder.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { enabled: false },
    });
  });

  it('religa o Reminder ao desmarcar a conclusão', async () => {
    const { tx } = buildTx({ reminderAt: '2026-10-01T09:00:00-03:00', done: true });
    const service = new TasksService(buildPrisma(tx), gamification as never);

    await service.uncomplete('u1', 't1');

    expect(tx.reminder.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { enabled: true },
    });
  });
});
