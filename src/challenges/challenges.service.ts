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
import type { Challenge, ChallengeCheck } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  challengeEndDate,
  challengeStatus,
  missedDays,
  type ChallengeStatus,
} from './challenge-status';
import type {
  CreateChallengeInput,
  UpdateChallengeInput,
} from './dto/challenge.schema';

/** Quanto o início pode ficar antes/depois de hoje. */
const START_WINDOW_DAYS = 30;

export interface ChallengeDto {
  id: string;
  title: string;
  why: string | null;
  icon: string;
  color: string;
  durationDays: number;
  startDate: string;
  endDate: string;
  checks: string[];
  doneDays: number;
  missedDays: number;
  status: ChallengeStatus;
  completedAt: string | null;
  abandonedAt: string | null;
}

function toDto(
  c: Challenge,
  checks: ChallengeCheck[],
  today: string,
): ChallengeDto {
  const startDate = dateToDay(c.startDate);
  const days = checks.map((k) => dateToDay(k.day)).sort();
  return {
    id: c.id,
    title: c.title,
    why: c.why,
    icon: c.icon,
    color: c.color,
    durationDays: c.durationDays,
    startDate,
    endDate: challengeEndDate(startDate, c.durationDays),
    checks: days,
    doneDays: days.length,
    missedDays: missedDays(startDate, c.durationDays, new Set(days), today),
    status: challengeStatus(
      {
        startDate,
        durationDays: c.durationDays,
        completed: c.completedAt !== null,
        abandoned: c.abandonedAt !== null,
      },
      today,
    ),
    completedAt: c.completedAt ? c.completedAt.toISOString() : null,
    abandonedAt: c.abandonedAt ? c.abandonedAt.toISOString() : null,
  };
}

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ChallengeDto[]> {
    const today = businessDay();
    const rows = await this.prisma.db.challenge.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
      include: { checks: true },
    });
    return rows.map((c) => toDto(c, c.checks, today));
  }

  async create(
    userId: string,
    dto: CreateChallengeInput,
  ): Promise<ChallengeDto> {
    const today = businessDay();
    const start = dto.startDate ?? today;
    if (
      start < addDays(today, -START_WINDOW_DAYS) ||
      start > addDays(today, START_WINDOW_DAYS)
    ) {
      throw new BadRequestException(
        `início deve ficar a no máximo ${START_WINDOW_DAYS} dias de hoje`,
      );
    }
    const created = await this.prisma.db.challenge.create({
      data: {
        userId,
        title: dto.title,
        why: dto.why ?? null,
        icon: dto.icon,
        color: dto.color,
        durationDays: dto.durationDays,
        startDate: dayToDate(start),
      },
    });
    return toDto(created, [], today);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateChallengeInput,
  ): Promise<ChallengeDto> {
    const current = await this.findOwned(userId, id);
    const { abandoned, ...rest } = dto;
    await this.prisma.db.challenge.update({
      where: { id },
      data: {
        ...rest,
        ...(abandoned !== undefined
          ? {
              abandonedAt: abandoned
                ? (current.abandonedAt ?? new Date())
                : null,
            }
          : {}),
      },
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<ChallengeDto> {
    const current = await this.get(userId, id);
    await this.prisma.db.challenge.delete({ where: { id } });
    return current;
  }

  async check(userId: string, id: string, day: string): Promise<ChallengeDto> {
    const challenge = await this.findOwned(userId, id);
    if (challenge.abandonedAt) {
      throw new BadRequestException('desafio encerrado por desistência');
    }
    const start = dateToDay(challenge.startDate);
    const end = challengeEndDate(start, challenge.durationDays);
    if (day < start || day > end) {
      throw new BadRequestException('dia fora do desafio');
    }
    if (day > businessDay()) {
      throw new BadRequestException('não dá para marcar dia futuro');
    }
    await this.prisma.db.challengeCheck.upsert({
      where: { challengeId_day: { challengeId: id, day: dayToDate(day) } },
      create: { challengeId: id, day: dayToDate(day) },
      update: {},
    });
    await this.syncCompletion(challenge);
    return this.get(userId, id);
  }

  async uncheck(
    userId: string,
    id: string,
    day: string,
  ): Promise<ChallengeDto> {
    const challenge = await this.findOwned(userId, id);
    await this.prisma.db.challengeCheck.deleteMany({
      where: { challengeId: id, day: dayToDate(day) },
    });
    await this.syncCompletion(challenge);
    return this.get(userId, id);
  }

  /** `completedAt` acompanha "todos os dias marcados" (marca e desmarca). */
  private async syncCompletion(challenge: Challenge): Promise<void> {
    const count = await this.prisma.db.challengeCheck.count({
      where: { challengeId: challenge.id },
    });
    const complete = count >= challenge.durationDays;
    if (complete === (challenge.completedAt !== null)) return;
    await this.prisma.db.challenge.update({
      where: { id: challenge.id },
      data: { completedAt: complete ? new Date() : null },
    });
  }

  private async get(userId: string, id: string): Promise<ChallengeDto> {
    const row = await this.prisma.db.challenge.findFirst({
      where: { id, userId },
      include: { checks: true },
    });
    if (!row) throw new NotFoundException('Desafio não encontrado');
    return toDto(row, row.checks, businessDay());
  }

  private async findOwned(userId: string, id: string): Promise<Challenge> {
    const row = await this.prisma.db.challenge.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Desafio não encontrado');
    return row;
  }
}
