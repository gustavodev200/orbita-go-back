import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  businessDay,
  dateToDay,
  dayToDate,
} from '../common/time/business-time';
import type { Habit, HabitCheck } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateHabitInput, UpdateHabitInput } from './dto/habit.schema';
import { habitBestStreak, habitStreak } from './habit-streak';

/** Quantos dias de marcações o GET devolve (inclui hoje). */
const CHECK_WINDOW_DAYS = 91;
/** Quantos dias o cálculo de sequência olha para trás. */
const STREAK_WINDOW_DAYS = 400;

export interface HabitDto {
  id: string;
  name: string;
  icon: string;
  color: string;
  weekdays: number[];
  reminderTime: string | null;
  checks: string[];
  streak: number;
  /** Maior sequência na janela de `STREAK_WINDOW_DAYS`. */
  bestStreak: number;
  /** Dia (YYYY-MM-DD) em que o hábito foi criado — base da taxa de consistência. */
  createdAt: string;
  objectiveId: string | null;
}

function toDto(habit: Habit, checks: HabitCheck[], today: string): HabitDto {
  const days = checks.map((c) => dateToDay(c.day));
  const checked = new Set(days);
  const from = addDays(today, -(CHECK_WINDOW_DAYS - 1));
  return {
    id: habit.id,
    name: habit.name,
    icon: habit.icon,
    color: habit.color,
    weekdays: habit.weekdays,
    reminderTime: habit.reminderTime,
    checks: days.filter((d) => d >= from && d <= today).sort(),
    streak: habitStreak(habit.weekdays, checked, today),
    bestStreak: habitBestStreak(
      habit.weekdays,
      checked,
      addDays(today, -(STREAK_WINDOW_DAYS - 1)),
      today,
    ),
    createdAt: businessDay(habit.createdAt),
    objectiveId: habit.objectiveId,
  };
}

@Injectable()
export class HabitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<HabitDto[]> {
    const today = businessDay();
    const habits = await this.prisma.db.habit.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: this.checksInclude(today),
    });
    return habits.map((h) => toDto(h, h.checks, today));
  }

  async create(userId: string, dto: CreateHabitInput): Promise<HabitDto> {
    const habit = await this.prisma.db.habit.create({
      data: {
        userId,
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        ...(dto.weekdays ? { weekdays: dto.weekdays } : {}),
        reminderTime: dto.reminderTime ?? null,
      },
    });
    return toDto(habit, [], businessDay());
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateHabitInput,
  ): Promise<HabitDto> {
    await this.findOwned(userId, id);
    await this.prisma.db.habit.update({
      where: { id },
      // Mudou o horário: libera um novo aviso ainda hoje.
      data: {
        ...dto,
        ...(dto.reminderTime !== undefined ? { lastFiredAt: null } : {}),
      },
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<HabitDto> {
    const current = await this.get(userId, id);
    await this.prisma.db.habit.delete({ where: { id } });
    return current;
  }

  async check(userId: string, id: string, day: string): Promise<HabitDto> {
    await this.findOwned(userId, id);
    if (day > businessDay()) {
      throw new BadRequestException('não dá para marcar dia futuro');
    }
    await this.prisma.db.habitCheck.upsert({
      where: { habitId_day: { habitId: id, day: dayToDate(day) } },
      create: { habitId: id, day: dayToDate(day) },
      update: {},
    });
    return this.get(userId, id);
  }

  async uncheck(userId: string, id: string, day: string): Promise<HabitDto> {
    await this.findOwned(userId, id);
    await this.prisma.db.habitCheck.deleteMany({
      where: { habitId: id, day: dayToDate(day) },
    });
    return this.get(userId, id);
  }

  private async get(userId: string, id: string): Promise<HabitDto> {
    const today = businessDay();
    const habit = await this.prisma.db.habit.findFirst({
      where: { id, userId },
      include: this.checksInclude(today),
    });
    if (!habit) throw new NotFoundException('Hábito não encontrado');
    return toDto(habit, habit.checks, today);
  }

  private async findOwned(userId: string, id: string): Promise<Habit> {
    const habit = await this.prisma.db.habit.findFirst({
      where: { id, userId },
    });
    if (!habit) throw new NotFoundException('Hábito não encontrado');
    return habit;
  }

  private checksInclude(today: string) {
    return {
      checks: {
        where: {
          day: { gte: dayToDate(addDays(today, -(STREAK_WINDOW_DAYS - 1))) },
        },
      },
    } as const;
  }
}
