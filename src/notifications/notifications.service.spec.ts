import type { PrismaService } from '../prisma/prisma.service';
import type { PushSenderService } from '../push/push-sender.service';
import type { RecurringsService } from '../recurrings/recurrings.service';
import { NotificationsService } from './notifications.service';

// 12:00 de sexta 2026-11-20 em São Paulo.
const NOW = new Date('2026-11-20T15:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    userId: 'u1',
    key: 'tasks-overdue',
    kind: 'task_overdue',
    severity: 'important',
    title: 'Tarefa atrasada: Lavar',
    body: 'Venceu ontem. Conclua ou reagende.',
    url: '/tarefas',
    entityId: '00000000-0000-0000-0000-00000000000a',
    wantsPush: true,
    pushedAt: null,
    readAt: null,
    dismissedAt: null,
    resolvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function build({
  tasks = [] as unknown[],
  existing = [] as ReturnType<typeof row>[],
  pending = [] as ReturnType<typeof row>[],
} = {}) {
  const db = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ notificationDigestTime: '23:00' }),
    },
    task: { findMany: jest.fn().mockResolvedValue(tasks), count: jest.fn() },
    objective: { findMany: jest.fn().mockResolvedValue([]) },
    goal: { findMany: jest.fn().mockResolvedValue([]) },
    habit: { findMany: jest.fn().mockResolvedValue([]) },
    habitCheck: { count: jest.fn() },
    challenge: { findMany: jest.fn().mockResolvedValue([]) },
    flashcard: { count: jest.fn().mockResolvedValue(0) },
    pushSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    notification: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValue(pending),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const recurrings = {
    list: jest.fn().mockResolvedValue([]),
    upcoming: jest.fn().mockResolvedValue([]),
  } as unknown as RecurringsService;
  const sender = { sendToUser: jest.fn().mockResolvedValue(1) };
  const service = new NotificationsService(
    { db } as unknown as PrismaService,
    recurrings,
    sender as unknown as PushSenderService,
  );
  return { db, sender, service };
}

type Row = Record<string, unknown>;
/** Argumento `n` da 1ª chamada de um mock, tipado (evita `any` do jest). */
function arg<T>(fn: jest.Mock, n = 0): T {
  return (fn.mock.calls as unknown[][])[0][n] as T;
}

const overdueTask = {
  id: '00000000-0000-0000-0000-00000000000a',
  title: 'Lavar',
  dueDate: new Date('2026-11-19T00:00:00Z'),
  priority: 'low',
};

describe('NotificationsService.sync', () => {
  it('cria notificação nova com push quando vem do cron', async () => {
    const { db, service } = build({ tasks: [overdueTask] });
    await service.sync('u1', NOW, { inApp: false });
    const { data } = arg<{ data: Row[] }>(db.notification.createMany);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ key: 'tasks-overdue', wantsPush: true });
  });

  it('vinda da tela não vira push (a pessoa já está vendo)', async () => {
    const { db, service } = build({ tasks: [overdueTask] });
    await service.sync('u1', NOW, { inApp: true });
    expect(
      arg<{ data: Row[] }>(db.notification.createMany).data[0].wantsPush,
    ).toBe(false);
  });

  it('situação que continua igual não gera escrita nenhuma', async () => {
    const { db, service } = build({ tasks: [overdueTask], existing: [row()] });
    await service.sync('u1', NOW, { inApp: false });
    expect(db.notification.createMany).not.toHaveBeenCalled();
    expect(db.notification.update).not.toHaveBeenCalled();
  });

  it('tarefa concluída resolve a notificação antiga', async () => {
    const { db, service } = build({ tasks: [], existing: [row()] });
    await service.sync('u1', NOW, { inApp: false });
    expect(db.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { resolvedAt: NOW },
    });
  });

  it('evento (meta concluída) não é resolvido quando o sinal some', async () => {
    const { db, service } = build({
      existing: [row({ key: 'objective-done:o1', kind: 'objective_done' })],
    });
    await service.sync('u1', NOW, { inApp: false });
    expect(db.notification.update).not.toHaveBeenCalled();
  });

  it('situação que volta reabre como nova (não lida, push de novo)', async () => {
    const { db, service } = build({
      tasks: [overdueTask],
      existing: [row({ resolvedAt: NOW, readAt: NOW, pushedAt: NOW })],
    });
    await service.sync('u1', NOW, { inApp: false });
    const { data } = arg<{ data: Row }>(db.notification.update);
    expect(data).toMatchObject({
      resolvedAt: null,
      readAt: null,
      dismissedAt: null,
      pushedAt: null,
      wantsPush: true,
    });
  });

  it('dispensada continua dispensada enquanto a situação existir', async () => {
    const { db, service } = build({
      tasks: [overdueTask],
      existing: [row({ dismissedAt: NOW, readAt: NOW })],
    });
    await service.sync('u1', NOW, { inApp: false });
    expect(db.notification.update).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.dispatchPush', () => {
  it('agrupa pendentes num push só e marca como enviados', async () => {
    const pending = [row(), row({ id: 'n2', key: 'k2', title: 'Outra' })];
    const { db, sender, service } = build();
    db.notification.findMany = jest.fn().mockResolvedValue(pending);
    await service.dispatchPush('u1', NOW);
    expect(sender.sendToUser).toHaveBeenCalledTimes(1);
    expect(arg<Row>(sender.sendToUser, 1)).toMatchObject({
      url: '/notificacoes',
      tag: 'notif-group',
    });
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1', 'n2'] } },
      data: { pushedAt: NOW },
    });
  });

  it('não envia no horário de silêncio', async () => {
    const { db, sender, service } = build();
    db.notification.findMany = jest.fn().mockResolvedValue([row()]);
    // 23:30 em São Paulo
    await service.dispatchPush('u1', new Date('2026-11-21T02:30:00.000Z'));
    expect(sender.sendToUser).not.toHaveBeenCalled();
  });
});
