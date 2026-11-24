import { Injectable, NotFoundException } from '@nestjs/common';
import {
  businessDay,
  dateToDay,
  dayToDate,
} from '../common/time/business-time';
import type { LifeEvent } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateLifeEventInput,
  UpdateLifeEventInput,
} from './dto/life-event.schema';
import { YearStatsBuilder, type YearStats } from './year-stats';

export type TimelineKind =
  | 'achievement'
  | 'project'
  | 'milestone'
  | 'objective'
  | 'savings'
  | 'challenge';

export interface TimelineEventDto {
  /** Id do registro de origem (`LifeEvent`, `Objective`, `Goal` ou `Challenge`). */
  id: string;
  /** Só eventos `manual` podem ser editados/excluídos na linha do tempo. */
  manual: boolean;
  kind: TimelineKind;
  title: string;
  description: string | null;
  date: string;
  icon: string;
}

export interface TimelineDto {
  events: TimelineEventDto[];
  years: YearStats[];
}

function lifeEventDto(e: LifeEvent): TimelineEventDto {
  return {
    id: e.id,
    manual: true,
    kind: e.kind,
    title: e.title,
    description: e.description,
    date: dateToDay(e.date),
    icon: e.icon,
  };
}

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<TimelineDto> {
    const db = this.prisma.db;
    const [
      user,
      lifeEvents,
      objectives,
      goals,
      challenges,
      tasks,
      checks,
      txs,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      }),
      db.lifeEvent.findMany({ where: { userId } }),
      db.objective.findMany({
        where: { userId, completedAt: { not: null } },
        select: {
          id: true,
          title: true,
          expectedResult: true,
          icon: true,
          completedAt: true,
        },
      }),
      db.goal.findMany({
        where: { userId, completedAt: { not: null } },
        select: {
          id: true,
          name: true,
          icon: true,
          targetCents: true,
          completedAt: true,
        },
      }),
      db.challenge.findMany({
        where: { userId, completedAt: { not: null } },
        select: {
          id: true,
          title: true,
          icon: true,
          durationDays: true,
          completedAt: true,
        },
      }),
      db.task.findMany({
        where: { userId, done: true, doneAt: { not: null } },
        select: { doneAt: true },
      }),
      db.habitCheck.findMany({
        where: { habit: { userId } },
        select: { day: true },
      }),
      db.transaction.findMany({
        where: { userId },
        select: { type: true, amountCents: true, date: true },
      }),
    ]);

    const events: TimelineEventDto[] = [
      ...lifeEvents.map(lifeEventDto),
      ...objectives.map((o) => ({
        id: o.id,
        manual: false,
        kind: 'objective' as const,
        title: o.title,
        description: o.expectedResult,
        date: businessDay(o.completedAt!),
        icon: o.icon,
      })),
      ...goals.map((g) => ({
        id: g.id,
        manual: false,
        kind: 'savings' as const,
        title: g.name,
        description: null,
        date: businessDay(g.completedAt!),
        icon: g.icon,
      })),
      ...challenges.map((c) => ({
        id: c.id,
        manual: false,
        kind: 'challenge' as const,
        title: c.title,
        description: `Desafio de ${c.durationDays} dias`,
        date: businessDay(c.completedAt!),
        icon: c.icon,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const today = businessDay();
    const firstDay = [
      user ? businessDay(user.createdAt) : today,
      ...events.map((e) => e.date),
    ].sort()[0];
    const stats = new YearStatsBuilder(
      Number(firstDay.slice(0, 4)),
      Number(today.slice(0, 4)),
    );
    for (const e of events) {
      if (e.manual) stats.add('lifeEvents', e.date);
      else if (e.kind === 'objective') stats.add('objectivesDone', e.date);
      else if (e.kind === 'savings') stats.add('savingsGoalsDone', e.date);
      else stats.add('challengesDone', e.date);
    }
    for (const t of tasks) stats.add('tasksDone', businessDay(t.doneAt!));
    for (const c of checks) stats.add('habitChecks', dateToDay(c.day));
    for (const t of txs) {
      stats.add(
        t.type === 'income' ? 'incomeCents' : 'expenseCents',
        dateToDay(t.date),
        t.amountCents,
      );
    }

    return { events, years: stats.build() };
  }

  async createEvent(
    userId: string,
    dto: CreateLifeEventInput,
  ): Promise<TimelineEventDto> {
    const created = await this.prisma.db.lifeEvent.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description ?? null,
        date: dayToDate(dto.date),
        kind: dto.kind,
        icon: dto.icon,
      },
    });
    return lifeEventDto(created);
  }

  async updateEvent(
    userId: string,
    id: string,
    dto: UpdateLifeEventInput,
  ): Promise<TimelineEventDto> {
    await this.findOwned(userId, id);
    const { date, ...rest } = dto;
    const updated = await this.prisma.db.lifeEvent.update({
      where: { id },
      data: { ...rest, ...(date ? { date: dayToDate(date) } : {}) },
    });
    return lifeEventDto(updated);
  }

  async removeEvent(userId: string, id: string): Promise<TimelineEventDto> {
    const current = await this.findOwned(userId, id);
    await this.prisma.db.lifeEvent.delete({ where: { id } });
    return lifeEventDto(current);
  }

  private async findOwned(userId: string, id: string): Promise<LifeEvent> {
    const row = await this.prisma.db.lifeEvent.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Evento não encontrado');
    return row;
  }
}
