import { Injectable, NotFoundException } from '@nestjs/common';
import { dateToDay, dayToDate } from '../common/time/business-time';
import type { Task } from '../generated/prisma/client';
import {
  GamificationService,
  type Rewarded,
} from '../gamification/gamification.service';
import { XP_RULES } from '../gamification/rules';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type {
  CreateTaskInput,
  MoveTaskInput,
  TaskStatus,
  UpdateTaskInput,
} from './dto/task.schema';

export interface TaskDto {
  id: string;
  title: string;
  dueDate: string | null;
  priority: 'high' | 'medium' | 'low';
  reminderAt: string | null;
  done: boolean;
  doneAt: string | null;
  status: TaskStatus;
  position: number;
  objectiveId: string | null;
}

function toDto(task: Task): TaskDto {
  return {
    id: task.id,
    title: task.title,
    dueDate: task.dueDate ? dateToDay(task.dueDate) : null,
    priority: task.priority,
    reminderAt: task.reminderAt,
    done: task.done,
    doneAt: task.doneAt ? task.doneAt.toISOString() : null,
    status: task.status,
    position: task.position,
    objectiveId: task.objectiveId,
  };
}

function dueDateData(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value ? dayToDate(value) : null;
}

/**
 * `reminderAt` de task só sai da tela como "HH:mm" (recorrente — não usado
 * hoje) ou datetime ISO "YYYY-MM-DDTHH:mm:ss±HH:mm" (sempre que a tela de
 * tarefas grava, via `reminderAtFrom`). Só o segundo formato carrega uma data
 * — sem ela não dá pra criar uma ocorrência (`Reminder.repeat = 'none'`).
 */
function parseReminderAt(value: string): { date: string; time: string } | null {
  if (value.length < 16) return null;
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

// Mantém o Reminder (kind='task', repeat='none') em sincronia com `Task.reminderAt`
// pra o cron de push (`DispatchRemindersService`) enxergar lembretes de tarefa.
async function syncReminder(
  tx: Tx,
  task: Pick<Task, 'id' | 'userId' | 'title' | 'reminderAt'>,
  enabled = true,
): Promise<void> {
  const parsed = task.reminderAt ? parseReminderAt(task.reminderAt) : null;
  if (!parsed) {
    await tx.reminder.deleteMany({ where: { taskId: task.id } });
    return;
  }
  await tx.reminder.upsert({
    where: { taskId: task.id },
    create: {
      userId: task.userId,
      taskId: task.id,
      title: task.title,
      kind: 'task',
      repeat: 'none',
      time: parsed.time,
      date: dayToDate(parsed.date),
      enabled,
    },
    update: {
      title: task.title,
      time: parsed.time,
      date: dayToDate(parsed.date),
      enabled,
      lastFiredAt: null,
    },
  });
}

/**
 * Posição para um card que chega na coluna sem posição explícita: fim da fila
 * nas colunas de trabalho; topo em "done" (concluída mais recente primeiro).
 */
async function nextPosition(
  tx: Tx,
  userId: string,
  status: TaskStatus,
): Promise<number> {
  const agg = await tx.task.aggregate({
    where: { userId, status },
    _max: { position: true },
    _min: { position: true },
  });
  return status === 'done'
    ? (agg._min.position ?? 0) - 1
    : (agg._max.position ?? 0) + 1;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async list(userId: string): Promise<TaskDto[]> {
    const tasks = await this.prisma.db.task.findMany({
      where: { userId },
      orderBy: [
        { done: 'asc' },
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
    return tasks.map(toDto);
  }

  async create(userId: string, dto: CreateTaskInput): Promise<TaskDto> {
    return this.prisma.transaction(async (tx) => {
      const status = dto.status ?? 'todo';
      const done = status === 'done';
      const task = await tx.task.create({
        data: {
          userId,
          title: dto.title,
          priority: dto.priority,
          dueDate: dueDateData(dto.dueDate) ?? null,
          reminderAt: dto.reminderAt ?? null,
          status,
          position: await nextPosition(tx, userId, status),
          // Criada já concluída (coluna "Feito"): sem XP — evita farm criar/excluir.
          done,
          doneAt: done ? new Date() : null,
          xpAwarded: done,
        },
      });
      await syncReminder(tx, task, !done);
      return toDto(task);
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTaskInput,
  ): Promise<TaskDto> {
    return this.prisma.transaction(async (tx) => {
      const task = await this.findOwned(tx, userId, id);
      const updated = await tx.task.update({
        where: { id: task.id },
        data: {
          title: dto.title,
          priority: dto.priority,
          dueDate: dueDateData(dto.dueDate),
          reminderAt: dto.reminderAt,
        },
      });
      if (dto.reminderAt !== undefined || dto.title !== undefined) {
        await syncReminder(tx, updated, !updated.done);
      }
      return toDto(updated);
    });
  }

  async remove(userId: string, id: string): Promise<TaskDto> {
    return this.prisma.transaction(async (tx) => {
      const task = await this.findOwned(tx, userId, id);
      // FK `reminders.task_id` é ON DELETE CASCADE — o lembrete some junto.
      await tx.task.delete({ where: { id: task.id } });
      return toDto(task);
    });
  }

  /** Exclusão em lote — só remove tarefas do próprio usuário (ids alheios são ignorados). */
  async removeMany(
    userId: string,
    ids: string[],
  ): Promise<{ deleted: number }> {
    const { count } = await this.prisma.db.task.deleteMany({
      where: { userId, id: { in: ids } },
    });
    return { deleted: count };
  }

  async complete(userId: string, id: string): Promise<Rewarded<TaskDto>> {
    return this.prisma.transaction(async (tx) => {
      const task = await this.findOwned(tx, userId, id);
      if (task.done) return { data: toDto(task), reward: null };
      return this.applyStatus(tx, task, 'done');
    });
  }

  async uncomplete(userId: string, id: string): Promise<TaskDto> {
    return this.prisma.transaction(async (tx) => {
      const task = await this.findOwned(tx, userId, id);
      if (!task.done) return toDto(task);
      return (await this.applyStatus(tx, task, 'todo')).data;
    });
  }

  async move(
    userId: string,
    id: string,
    dto: MoveTaskInput,
  ): Promise<Rewarded<TaskDto>> {
    return this.prisma.transaction(async (tx) => {
      const task = await this.findOwned(tx, userId, id);
      return this.applyStatus(tx, task, dto.status, dto.position);
    });
  }

  /**
   * Única porta de troca de coluna: mantém `done`/`doneAt`, o lembrete e o XP
   * coerentes com o status (entrar em "done" = concluir; sair = reabrir).
   */
  private async applyStatus(
    tx: Tx,
    task: Task,
    status: TaskStatus,
    position?: number,
  ): Promise<Rewarded<TaskDto>> {
    const finishing = status === 'done' && !task.done;
    const reopening = status !== 'done' && task.done;
    const updated = await tx.task.update({
      where: { id: task.id },
      data: {
        status,
        position:
          position ??
          (status === task.status
            ? task.position
            : await nextPosition(tx, task.userId, status)),
        ...(finishing && { done: true, doneAt: new Date(), xpAwarded: true }),
        ...(reopening && { done: false, doneAt: null }),
      },
    });
    if (finishing || reopening) {
      // Concluída não avisa mais — desliga sem apagar (reabrir religa).
      await tx.reminder.updateMany({
        where: { taskId: task.id },
        data: { enabled: reopening },
      });
    }
    // XP só na 1ª conclusão — desmarcar e marcar de novo não rende XP.
    const reward =
      finishing && !task.xpAwarded
        ? await this.gamification.award(task.userId, XP_RULES.taskComplete, tx)
        : null;
    return { data: toDto(updated), reward };
  }

  private async findOwned(tx: Tx, userId: string, id: string): Promise<Task> {
    const task = await tx.task.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException('Tarefa não encontrada');
    return task;
  }
}
