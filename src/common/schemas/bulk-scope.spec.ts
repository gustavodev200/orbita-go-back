import type { PrismaService } from '../../prisma/prisma.service';
import { RemindersService } from '../../reminders/reminders.service';
import { TasksService } from '../../tasks/tasks.service';

function prismaWith(model: 'task' | 'reminder') {
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    db: { [model]: { deleteMany } },
  } as unknown as PrismaService;
  return { prisma, deleteMany };
}

describe('exclusão em lote — escopo do usuário', () => {
  it('tarefas: só apaga do próprio usuário', async () => {
    const { prisma, deleteMany } = prismaWith('task');
    const service = new TasksService(prisma, {} as never);
    await expect(service.removeMany('u1', ['a', 'b'])).resolves.toEqual({
      deleted: 1,
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', id: { in: ['a', 'b'] } },
    });
  });

  it('lembretes: só do próprio usuário e nunca espelhos de tarefa/nota', async () => {
    const { prisma, deleteMany } = prismaWith('reminder');
    const service = new RemindersService(prisma);
    await service.removeMany('u1', ['a']);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', taskId: null, noteId: null, id: { in: ['a'] } },
    });
  });
});
