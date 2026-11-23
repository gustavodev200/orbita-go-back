import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Flashcard } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  FlashcardInput,
  ReviewFlashcardInput,
  UpdateFlashcardInput,
} from './dto/flashcard.schema';

/** Teto do GET /flashcards — vocabulário pessoal, sem paginação por enquanto. */
const LIST_LIMIT = 500;

export interface FlashcardDto {
  id: string;
  pt: string;
  en: string;
  example: string | null;
  note: string | null;
  correctCount: number;
  wrongCount: number;
  lastReviewedAt: string | null;
  createdAt: string;
}

export interface CreateFlashcardsResult {
  created: FlashcardDto[];
  /** Pares pt/en que já existiam (comparação sem diferenciar maiúsculas). */
  skipped: { pt: string; en: string }[];
}

function toDto(card: Flashcard): FlashcardDto {
  return {
    id: card.id,
    pt: card.pt,
    en: card.en,
    example: card.example,
    note: card.note,
    correctCount: card.correctCount,
    wrongCount: card.wrongCount,
    lastReviewedAt: card.lastReviewedAt?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
  };
}

const pairKey = (pt: string, en: string) =>
  `${pt.toLowerCase()}\u0000${en.toLowerCase()}`;

@Injectable()
export class FlashcardsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, q?: string): Promise<FlashcardDto[]> {
    const search = q
      ? {
          OR: [
            { pt: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { en: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {};
    const cards = await this.prisma.db.flashcard.findMany({
      where: { userId, ...search },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return cards.map(toDto);
  }

  /** Nunca revisados primeiro, depois os revisados há mais tempo. */
  async reviewQueue(userId: string, limit: number): Promise<FlashcardDto[]> {
    const cards = await this.prisma.db.flashcard.findMany({
      where: { userId },
      orderBy: [
        { lastReviewedAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
    return cards.map(toDto);
  }

  /** Cria em lote ignorando pares pt/en repetidos (no lote ou já salvos). */
  async create(
    userId: string,
    cards: FlashcardInput[],
  ): Promise<CreateFlashcardsResult> {
    const existing = await this.prisma.db.flashcard.findMany({
      where: {
        userId,
        OR: cards.map((c) => ({
          pt: { equals: c.pt, mode: Prisma.QueryMode.insensitive },
          en: { equals: c.en, mode: Prisma.QueryMode.insensitive },
        })),
      },
      select: { pt: true, en: true },
    });
    const seen = new Set(existing.map((c) => pairKey(c.pt, c.en)));

    const fresh: FlashcardInput[] = [];
    const skipped: { pt: string; en: string }[] = [];
    for (const card of cards) {
      const key = pairKey(card.pt, card.en);
      if (seen.has(key)) {
        skipped.push({ pt: card.pt, en: card.en });
        continue;
      }
      seen.add(key);
      fresh.push(card);
    }

    const created = fresh.length
      ? await this.prisma.db.flashcard.createManyAndReturn({
          data: fresh.map((c) => ({
            userId,
            pt: c.pt,
            en: c.en,
            example: c.example ?? null,
            note: c.note ?? null,
          })),
          // Corrida entre duas chamadas iguais: o índice único decide.
          skipDuplicates: true,
        })
      : [];
    return { created: created.map(toDto), skipped };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateFlashcardInput,
  ): Promise<FlashcardDto> {
    await this.findOwned(userId, id);
    try {
      return toDto(
        await this.prisma.db.flashcard.update({ where: { id }, data: dto }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Já existe um card com esse par');
      }
      throw error;
    }
  }

  async review(
    userId: string,
    id: string,
    { result }: ReviewFlashcardInput,
  ): Promise<FlashcardDto> {
    await this.findOwned(userId, id);
    const card = await this.prisma.db.flashcard.update({
      where: { id },
      data: {
        ...(result === 'correct'
          ? { correctCount: { increment: 1 } }
          : { wrongCount: { increment: 1 } }),
        lastReviewedAt: new Date(),
      },
    });
    return toDto(card);
  }

  async remove(userId: string, id: string): Promise<FlashcardDto> {
    const card = await this.findOwned(userId, id);
    await this.prisma.db.flashcard.delete({ where: { id } });
    return toDto(card);
  }

  private async findOwned(userId: string, id: string): Promise<Flashcard> {
    const card = await this.prisma.db.flashcard.findFirst({
      where: { id, userId },
    });
    if (!card) throw new NotFoundException('Card não encontrado');
    return card;
  }
}
