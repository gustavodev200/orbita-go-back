import { BadRequestException, NotFoundException } from '@nestjs/common';
import { addDays, businessDay, dayToDate } from '../common/time/business-time';
import type { PrismaService } from '../prisma/prisma.service';
import { ChallengesService } from './challenges.service';

function challenge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: 'u1',
    title: '21 dias lendo',
    why: null,
    durationDays: 7,
    startDate: dayToDate(addDays(businessDay(), -2)),
    icon: 'menu_book',
    color: '#3B82F6',
    completedAt: null,
    abandonedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildPrisma(found: unknown) {
  const db = {
    challenge: {
      findFirst: jest.fn().mockResolvedValue(found),
      create: jest.fn(),
    },
    challengeCheck: { upsert: jest.fn(), count: jest.fn() },
  };
  return {
    db,
    service: new ChallengesService({ db } as unknown as PrismaService),
  };
}

describe('ChallengesService.check', () => {
  it('recusa dia antes do início', async () => {
    const { db, service } = buildPrisma(challenge());
    await expect(
      service.check('u1', 'c1', addDays(businessDay(), -3)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.challengeCheck.upsert).not.toHaveBeenCalled();
  });

  it('recusa dia futuro', async () => {
    const { service } = buildPrisma(challenge());
    await expect(
      service.check('u1', 'c1', addDays(businessDay(), 1)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa desafio abandonado', async () => {
    const { service } = buildPrisma(challenge({ abandonedAt: new Date() }));
    await expect(
      service.check('u1', 'c1', businessDay()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('desafio de outro usuário responde 404', async () => {
    const { service } = buildPrisma(null);
    await expect(
      service.check('u1', 'c1', businessDay()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ChallengesService.create', () => {
  it('recusa início a mais de 30 dias de hoje', async () => {
    const { db, service } = buildPrisma(null);
    await expect(
      service.create('u1', {
        title: 'x',
        icon: 'bolt',
        color: '#FF6A1F',
        durationDays: 7,
        startDate: addDays(businessDay(), 31),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.challenge.create).not.toHaveBeenCalled();
  });
});
