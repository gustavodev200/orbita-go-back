import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { reviewFlashcardSchema } from './dto/flashcard.schema';
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
    srsState: 'new',
    srsStep: 0,
    ease: 2.5,
    intervalDays: 0,
    lapses: 0,
    dueAt: null,
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
      count: jest.fn().mockResolvedValue(0),
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
  function updateData(db: ReturnType<typeof buildPrisma>['db']) {
    const [[{ data }]] = db.flashcard.update.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    return data;
  }

  it('"Lembrei" num card novo conta acerto e volta em 5 minutos', async () => {
    const { db, prisma } = buildPrisma();
    db.flashcard.findFirst.mockResolvedValue(card());
    db.flashcard.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve(card({ ...data, correctCount: 1 })),
    );
    const service = new FlashcardsService(prisma);

    const before = Date.now();
    const dto = await service.review('u1', 'c1', { rating: 'good' });

    const data = updateData(db);
    expect(data.correctCount).toEqual({ increment: 1 });
    expect(data.wrongCount).toBeUndefined();
    expect(data.srsState).toBe('learning');
    expect(data.srsStep).toBe(1);
    expect(data.lastReviewedAt).toBeInstanceOf(Date);
    const dueInMin = ((data.dueAt as Date).getTime() - before) / 60_000;
    expect(dueInMin).toBeGreaterThanOrEqual(5);
    expect(dueInMin).toBeLessThan(5.1);
    expect(dto.state).toBe('learning');
    expect(dto.nextIntervalMinutes).toEqual({
      again: 1,
      hard: 3,
      good: 5,
      easy: 10,
    });
  });

  it('card formado: "Lembrei" agenda em dias', async () => {
    const { db, prisma } = buildPrisma();
    db.flashcard.findFirst.mockResolvedValue(card({ srsState: 'review' }));
    db.flashcard.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve(card({ ...data })),
    );
    const service = new FlashcardsService(prisma);

    const dto = await service.review('u1', 'c1', { rating: 'good' });

    expect(updateData(db).intervalDays).toBe(3);
    // Próximo "Lembrei": 3 × 2,5 = 8 dias.
    expect(dto.nextIntervalMinutes.good).toBe(8 * 1440);
    expect(dto.nextIntervalDays.good).toBe(8);
  });

  it('"Esqueci" conta erro', async () => {
    const { db, prisma } = buildPrisma();
    db.flashcard.findFirst.mockResolvedValue(card());
    db.flashcard.update.mockResolvedValue(card({ wrongCount: 1 }));
    const service = new FlashcardsService(prisma);

    await service.review('u1', 'c1', { rating: 'again' });

    expect(updateData(db).wrongCount).toEqual({ increment: 1 });
  });

  it('card de outro usuário responde 404', async () => {
    const { db, prisma } = buildPrisma();
    db.flashcard.findFirst.mockResolvedValue(null);
    const service = new FlashcardsService(prisma);

    await expect(
      service.review('u1', 'c1', { rating: 'again' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.flashcard.update).not.toHaveBeenCalled();
  });
});

describe('FlashcardsService.reviewQueue', () => {
  it('traz vencidos antes dos novos e completa até o limite', async () => {
    const { db, prisma } = buildPrisma();
    const due = card({
      id: 'd1',
      srsState: 'review',
      intervalDays: 3,
      dueAt: new Date('2026-11-20T00:00:00Z'),
    });
    db.flashcard.findMany
      .mockResolvedValueOnce([due])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([card({ id: 'n1' })]);
    const service = new FlashcardsService(prisma);

    const queue = await service.reviewQueue('u1', 2);

    expect(queue.map((c) => c.id)).toEqual(['d1', 'n1']);
    type Args = [{ where: Record<string, unknown>; take: number }];
    const calls = db.flashcard.findMany.mock.calls as [Args, Args, Args];
    expect((calls[0][0].where.dueAt as { lte: unknown }).lte).toBeInstanceOf(
      Date,
    );
    expect(calls[2][0]).toMatchObject({
      where: { userId: 'u1', dueAt: null },
      take: 1,
    });
  });

  it('libera só o que falta para 20 novos no dia', async () => {
    const { db, prisma } = buildPrisma();
    // 18 começados hoje (poucas revisões) + 1 antigo revisto hoje (não conta).
    const startedToday = Array.from({ length: 18 }, () => ({
      correctCount: 2,
      wrongCount: 1,
    }));
    db.flashcard.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        ...startedToday,
        { correctCount: 9, wrongCount: 2 },
      ])
      .mockResolvedValueOnce([]);
    const service = new FlashcardsService(prisma);

    await service.reviewQueue('u1', 20);

    type Args = [{ take: number }];
    const calls = db.flashcard.findMany.mock.calls as [Args, Args, Args];
    expect(calls[2][0].take).toBe(2);
  });

  it('não busca novos quando o limite do dia acabou', async () => {
    const { db, prisma } = buildPrisma();
    db.flashcard.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        Array.from({ length: 20 }, () => ({ correctCount: 1, wrongCount: 0 })),
      );
    const service = new FlashcardsService(prisma);

    expect(await service.reviewQueue('u1', 20)).toEqual([]);
    expect(db.flashcard.findMany).toHaveBeenCalledTimes(2);
  });

  it('não busca novos quando os vencidos já enchem a rodada', async () => {
    const { db, prisma } = buildPrisma();
    db.flashcard.findMany.mockResolvedValueOnce([card({ dueAt: new Date(0) })]);
    const service = new FlashcardsService(prisma);

    await service.reviewQueue('u1', 1);

    expect(db.flashcard.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('reviewFlashcardSchema', () => {
  it('aceita o formato antigo correct/wrong', () => {
    expect(reviewFlashcardSchema.parse({ result: 'correct' })).toEqual({
      rating: 'good',
    });
    expect(reviewFlashcardSchema.parse({ result: 'wrong' })).toEqual({
      rating: 'again',
    });
    expect(reviewFlashcardSchema.parse({ rating: 'easy' })).toEqual({
      rating: 'easy',
    });
    expect(() => reviewFlashcardSchema.parse({ rating: 'meh' })).toThrow();
  });
});
