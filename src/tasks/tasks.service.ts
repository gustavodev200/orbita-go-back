import { Injectable, NotFoundException } from '@nestjs/common';
import { dateToDay, dayToDate } from '../common/time/business-time';
import type { Task } from '../generated/prisma/client';
import {
  GamificationService,
  type Rewarded,
} from '../gamification/gamification.service';
import { XP_RULES } from '../gamification/rules';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type { CreateTaskInput, UpdateTaskInput } from './dto/task.schema';

export interface TaskDto {
  id: string;
  title: string;
  dueDate: string | null;
  priority: 'high' | 'medium' | 'low';
  reminderAt: string | null;
  done: boolean;
  doneAt: string | null;
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
      const task = await tx.task.create({
        data: {
          userId,
          title: dto.title,
          priority: dto.priority,
          dueDate: dueDateData(dto.dueDate) ?? null,
          reminderAt: dto.reminderAt ?? null,
        },
      });
      await syncReminder(tx, task);
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

  async complete(userId: string, id: string): Promise<Rewarded<TaskDto>> {
    return this.prisma.transaction(async (tx) => {
      const task = await this.findOwned(tx, userId, id);
      if (task.done) {
        return { data: toDto(task), reward: null };
      }
      const updated = await tx.task.update({
        where: { id: task.id },
        data: { done: true, doneAt: new Date(), xpAwarded: true },
      });
      // Tarefa concluída não precisa mais avisar — desliga sem apagar (uncomplete religa).
      await tx.reminder.updateMany({
        where: { taskId: id },
        data: { enabled: false },
      });
      // XP só na 1ª conclusão — desmarcar e marcar de novo não rende XP.
      const reward = task.xpAwarded
        ? null
        : await this.gamification.award(userId, XP_RULES.taskComplete, tx);
      return { data: toDto(updated), reward };
    });
  }

  async uncomplete(userId: string, id: string): Promise<TaskDto> {
    return this.prisma.transaction(async (tx) => {
      const task = await this.findOwned(tx, userId, id);
      const updated = await tx.task.update({
        where: { id: task.id },
        data: { done: false, doneAt: null },
      });
      await tx.reminder.updateMany({
        where: { taskId: id },
        data: { enabled: true },
      });
      return toDto(updated);
    });
  }

  private async findOwned(tx: Tx, userId: string, id: string): Promise<Task> {
    const task = await tx.task.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException('Tarefa não encontrada');
    return task;
  }
}
