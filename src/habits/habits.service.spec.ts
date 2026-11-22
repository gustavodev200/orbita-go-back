import { BadRequestException, NotFoundException } from '@nestjs/common';
import { addDays, businessDay } from '../common/time/business-time';
import type { PrismaService } from '../prisma/prisma.service';
import { HabitsService } from './habits.service';

const habit = {
  id: 'h1',
  userId: 'u1',
  name: 'Beber água',
  icon: 'water_drop',
  color: '#3B82F6',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  reminderTime: null,
  lastFiredAt: null,
  createdAt: new Date(),
};

function buildPrisma(found: unknown) {
  const db = {
    habit: { findFirst: jest.fn().mockResolvedValue(found) },
    habitCheck: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn(),
    },
  };
  return { db, prisma: { db } as unknown as PrismaService };
}

describe('HabitsService.check', () => {
  it('recusa marcar dia futuro com 400', async () => {
    const { db, prisma } = buildPrisma(habit);
    const service = new HabitsService(prisma);
    const tomorrow = addDays(businessDay(), 1);

    await expect(service.check('u1', 'h1', tomorrow)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.habitCheck.upsert).not.toHaveBeenCalled();
  });

  it('hábito de outro usuário responde 404', async () => {
    const { prisma } = buildPrisma(null);
    const service = new HabitsService(prisma);

    await expect(
      service.check('u1', 'h1', businessDay()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
