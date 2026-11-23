import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { FlashcardsService } from './flashcards.service';

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: 'u1',
    pt: 'dona de casa',
    en: 'housewife',
    example: null,
    note: null,
    correctCount: 0,
    wrongCount: 0,
    lastReviewedAt: null,
    createdAt: new Date('2026-11-23T12:00:00Z'),
    ...overrides,
  };
}

function buildPrisma(existing: { pt: string; en: string }[] = []) {
  const db = {
    flashcard: {
      findMany: jest.fn().mockResolvedValue(existing),
      findFirst: jest.fn(),
      createManyAndReturn: jest.fn(({ data }: { data: object[] }) =>
        Promise.resolve(data.map((d, i) => card({ ...d, id: `n${i}` }))),
      ),
      update: jest.fn(),
    },
  };
  return { db, prisma: { db } as unknown as PrismaService };
}

describe('FlashcardsService.create', () => {
  it('ignora pares já salvos e repetidos no lote, sem diferenciar maiúsculas', async () => {
    const { db, prisma } = buildPrisma([{ pt: 'Trabalho', en: 'work' }]);
    const service = new FlashcardsService(prisma);

    const result = await service.create('u1', [
      { pt: 'trabalho', en: 'Work' },
      { pt: 'cansado', en: 'tired', example: 'I was tired.' },
      { pt: 'Cansado', en: 'TIRED' },
    ]);

    expect(result.created.map((c) => c.pt)).toEqual(['cansado']);
    expect(result.skipped).toEqual([
      { pt: 'trabalho', en: 'Work' },
      { pt: 'Cansado', en: 'TIRED' },
    ]);
    expect(db.flashcard.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          userId: 'u1',
          pt: 'cansado',
          en: 'tired',
          example: 'I was tired.',
          note: null,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('não chama o insert quando tudo já existe', async () => {
    const { db, prisma } = buildPrisma([{ pt: 'depois', en: 'then' }]);
    const service = new FlashcardsService(prisma);

    const result = await service.create('u1', [{ pt: 'depois', en: 'then' }]);

    expect(result.created).toEqual([]);
    expect(db.flashcard.createManyAndReturn).not.toHaveBeenCalled();
  });
});

describe('FlashcardsService.review', () => {
  it('incrementa acertos e marca a revisão', async () => {
    const { db, prisma } = buildPrisma();
    db.flashcard.findFirst.mockResolvedValue(card());
    db.flashcard.update.mockResolvedValue(card({ correctCount: 1 }));
    const service = new FlashcardsService(prisma);

    await service.review('u1', 'c1', { result: 'correct' });

    const [[{ data }]] = db.flashcard.update.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    expect(data.correctCount).toEqual({ increment: 1 });
    expect(data.wrongCount).toBeUndefined();
    expect(data.lastReviewedAt).toBeInstanceOf(Date);
  });

  it('card de outro usuário responde 404', async () => {
    const { db, prisma } = buildPrisma();
    db.flashcard.findFirst.mockResolvedValue(null);
    const service = new FlashcardsService(prisma);

    await expect(
      service.review('u1', 'c1', { result: 'wrong' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.flashcard.update).not.toHaveBeenCalled();
  });
});
