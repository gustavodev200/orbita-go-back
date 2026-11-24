import { Injectable, NotFoundException } from '@nestjs/common';
import { dateToDay, dayToDate } from '../common/time/business-time';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMilestoneInput,
  CreateObjectiveInput,
  UpdateMilestoneInput,
  UpdateObjectiveInput,
} from './dto/objective.schema';
import { objectiveProgress } from './objective-progress';

export interface ObjectiveDto {
  id: string;
  title: string;
  why: string | null;
  expectedResult: string | null;
  horizon: 'short' | 'medium' | 'long';
  deadline: string | null;
  icon: string;
  color: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  progress: number;
  milestones: { id: string; title: string; done: boolean }[];
  tasks: {
    id: string;
    title: string;
    done: boolean;
    dueDate: string | null;
  }[];
  habits: { id: string; name: string; icon: string; color: string }[];
}

const include = {
  milestones: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  tasks: {
    select: { id: true, title: true, done: true, dueDate: true },
    orderBy: { createdAt: 'asc' },
  },
  habits: {
    select: { id: true, name: true, icon: true, color: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ObjectiveInclude;

type ObjectiveWithRelations = Prisma.ObjectiveGetPayload<{
  include: typeof include;
}>;

function toDto(o: ObjectiveWithRelations): ObjectiveDto {
  const milestones = o.milestones.map((m) => ({
    id: m.id,
    title: m.title,
    done: m.done,
  }));
  const tasks = o.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    done: t.done,
    dueDate: t.dueDate ? dateToDay(t.dueDate) : null,
  }));
  const completed = o.completedAt !== null;
  return {
    id: o.id,
    title: o.title,
    why: o.why,
    expectedResult: o.expectedResult,
    horizon: o.horizon,
    deadline: o.deadline ? dateToDay(o.deadline) : null,
    icon: o.icon,
    color: o.color,
    completed,
    completedAt: o.completedAt ? o.completedAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
    progress: objectiveProgress([...milestones, ...tasks], completed),
    milestones,
    tasks,
    habits: o.habits,
  };
}

@Injectable()
export class ObjectivesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ObjectiveDto[]> {
    const rows = await this.prisma.db.objective.findMany({
      where: { userId },
      orderBy: [
        { completedAt: { sort: 'desc', nulls: 'first' } },
        { createdAt: 'asc' },
      ],
      include,
    });
    return rows.map(toDto);
  }

  async create(
    userId: string,
    dto: CreateObjectiveInput,
  ): Promise<ObjectiveDto> {
    const created = await this.prisma.db.objective.create({
      data: {
        userId,
        title: dto.title,
        why: dto.why ?? null,
        expectedResult: dto.expectedResult ?? null,
        horizon: dto.horizon,
        deadline: dto.deadline ? dayToDate(dto.deadline) : null,
        icon: dto.icon,
        color: dto.color,
        milestones: {
          create: (dto.milestones ?? []).map((title, position) => ({
            title,
            position,
          })),
        },
      },
      include,
    });
    return toDto(created);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateObjectiveInput,
  ): Promise<ObjectiveDto> {
    const current = await this.findOwned(userId, id);
    const { completed, deadline, ...rest } = dto;
    await this.prisma.db.objective.update({
      where: { id },
      data: {
        ...rest,
        ...(deadline !== undefined
          ? { deadline: deadline ? dayToDate(deadline) : null }
          : {}),
        ...(completed !== undefined
          ? {
              completedAt: completed
                ? (current.completedAt ?? new Date())
                : null,
            }
          : {}),
      },
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<ObjectiveDto> {
    const current = await this.get(userId, id);
    await this.prisma.db.objective.delete({ where: { id } });
    return current;
  }

  async addMilestone(
    userId: string,
    id: string,
    dto: CreateMilestoneInput,
  ): Promise<ObjectiveDto> {
    await this.findOwned(userId, id);
    const last = await this.prisma.db.objectiveMilestone.aggregate({
      where: { objectiveId: id },
      _max: { position: true },
    });
    await this.prisma.db.objectiveMilestone.create({
      data: {
        objectiveId: id,
        title: dto.title,
        position: (last._max.position ?? -1) + 1,
      },
    });
    return this.get(userId, id);
  }

  async updateMilestone(
    userId: string,
    id: string,
    milestoneId: string,
    dto: UpdateMilestoneInput,
  ): Promise<ObjectiveDto> {
    await this.findMilestone(userId, id, milestoneId);
    await this.prisma.db.objectiveMilestone.update({
      where: { id: milestoneId },
      data: {
        ...dto,
        ...(dto.done !== undefined
          ? { doneAt: dto.done ? new Date() : null }
          : {}),
      },
    });
    return this.get(userId, id);
  }

  async removeMilestone(
    userId: string,
    id: string,
    milestoneId: string,
  ): Promise<ObjectiveDto> {
    await this.findMilestone(userId, id, milestoneId);
    await this.prisma.db.objectiveMilestone.delete({
      where: { id: milestoneId },
    });
    return this.get(userId, id);
  }

  async linkTask(
    userId: string,
    id: string,
    taskId: string,
    linked: boolean,
  ): Promise<ObjectiveDto> {
    await this.findOwned(userId, id);
    const { count } = await this.prisma.db.task.updateMany({
      where: linked
        ? { id: taskId, userId }
        : { id: taskId, userId, objectiveId: id },
      data: { objectiveId: linked ? id : null },
    });
    if (linked && count === 0) {
      throw new NotFoundException('Tarefa não encontrada');
    }
    return this.get(userId, id);
  }

  async linkHabit(
    userId: string,
    id: string,
    habitId: string,
    linked: boolean,
  ): Promise<ObjectiveDto> {
    await this.findOwned(userId, id);
    const { count } = await this.prisma.db.habit.updateMany({
      where: linked
        ? { id: habitId, userId }
        : { id: habitId, userId, objectiveId: id },
      data: { objectiveId: linked ? id : null },
    });
    if (linked && count === 0) {
      throw new NotFoundException('Hábito não encontrado');
    }
    return this.get(userId, id);
  }

  private async get(userId: string, id: string): Promise<ObjectiveDto> {
    const row = await this.prisma.db.objective.findFirst({
      where: { id, userId },
      include,
    });
    if (!row) throw new NotFoundException('Meta não encontrada');
    return toDto(row);
  }

  private async findOwned(userId: string, id: string) {
    const row = await this.prisma.db.objective.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Meta não encontrada');
    return row;
  }

  private async findMilestone(userId: string, id: string, milestoneId: string) {
    const row = await this.prisma.db.objectiveMilestone.findFirst({
      where: { id: milestoneId, objectiveId: id, objective: { userId } },
    });
    if (!row) throw new NotFoundException('Etapa não encontrada');
    return row;
  }
}
