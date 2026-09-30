import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  businessDay,
  dateToDay,
  dayToDate,
} from '../common/time/business-time';
import type { Reminder } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type {
  CreateReminderInput,
  UpdateReminderInput,
} from './dto/reminder.schema';
import { parseReminderText, type ParsedReminder } from './reminder-parser';

export interface ReminderDto {
  id: string;
  title: string;
  kind: 'finance' | 'task';
  time: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  dayOfMonth?: number;
  weekday?: number;
  date?: string;
  enabled: boolean;
}

function toDto(reminder: Reminder): ReminderDto {
  return {
    id: reminder.id,
    title: reminder.title,
    kind: reminder.kind,
    time: reminder.time,
    repeat: reminder.repeat,
    dayOfMonth: reminder.dayOfMonth ?? undefined,
    weekday: reminder.weekday ?? undefined,
    date: reminder.date ? dateToDay(reminder.date) : undefined,
    enabled: reminder.enabled,
  };
}

type ScheduleFields = Pick<
  CreateReminderInput,
  'repeat' | 'dayOfMonth' | 'weekday' | 'date'
>;

// Mantém só o campo de agenda que faz sentido para a repetição escolhida.
function normalizeSchedule(fields: ScheduleFields) {
  const { repeat } = fields;
  if (repeat === 'monthly' && !fields.dayOfMonth) {
    throw new BadRequestException('dayOfMonth: obrigatório para mensal');
  }
  if (
    repeat === 'weekly' &&
    (fields.weekday === null || fields.weekday === undefined)
  ) {
    throw new BadRequestException('weekday: obrigatório para semanal');
  }
  return {
    repeat,
    dayOfMonth: repeat === 'monthly' ? (fields.dayOfMonth ?? null) : null,
    weekday: repeat === 'weekly' ? (fields.weekday ?? null) : null,
    date: repeat === 'none' ? dayToDate(fields.date ?? businessDay()) : null,
  };
}

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ReminderDto[]> {
    const reminders = await this.prisma.db.reminder.findMany({
      where: { userId },
      orderBy: [{ enabled: 'desc' }, { time: 'asc' }, { createdAt: 'desc' }],
    });
    return reminders.map(toDto);
  }

  parse(text: string): ParsedReminder {
    return parseReminderText(text, businessDay());
  }

  async create(userId: string, dto: CreateReminderInput): Promise<ReminderDto> {
    const reminder = await this.prisma.db.reminder.create({
      data: {
        userId,
        title: dto.title,
        kind: dto.kind,
        time: dto.time,
        enabled: dto.enabled ?? true,
        ...normalizeSchedule(dto),
      },
    });
    return toDto(reminder);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateReminderInput,
  ): Promise<ReminderDto> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.findOwned(tx, userId, id);
      const scheduleTouched =
        dto.repeat !== undefined ||
        dto.dayOfMonth !== undefined ||
        dto.weekday !== undefined ||
        dto.date !== undefined;
      const schedule = scheduleTouched
        ? normalizeSchedule({
            repeat: dto.repeat ?? current.repeat,
            dayOfMonth:
              dto.dayOfMonth === undefined
                ? current.dayOfMonth
                : dto.dayOfMonth,
            weekday: dto.weekday === undefined ? current.weekday : dto.weekday,
            date:
              dto.date === undefined
                ? current.date
                  ? dateToDay(current.date)
                  : null
                : dto.date,
          })
        : {};
      const updated = await tx.reminder.update({
        where: { id: current.id },
        data: {
          title: dto.title,
          kind: dto.kind,
          time: dto.time,
          enabled: dto.enabled,
          ...schedule,
        },
      });
      return toDto(updated);
    });
  }

  async remove(userId: string, id: string): Promise<ReminderDto> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.findOwned(tx, userId, id);
      await tx.reminder.delete({ where: { id: current.id } });
      return toDto(current);
    });
  }

  private async findOwned(
    tx: Tx,
    userId: string,
    id: string,
  ): Promise<Reminder> {
    const reminder = await tx.reminder.findFirst({ where: { id, userId } });
    if (!reminder) throw new NotFoundException('Lembrete não encontrado');
    return reminder;
  }
}
