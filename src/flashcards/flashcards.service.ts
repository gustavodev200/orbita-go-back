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
import {
  LEARNING_STEPS,
  nextIntervalMinutes,
  schedule,
  SRS_STATES,
  studyDayStart,
  type Rating,
  type SrsCard,
  type SrsState,
} from './srs';

/** Teto do GET /flashcards — vocabulário pessoal, sem paginação por enquanto. */
const LIST_LIMIT = 500;
/** Cards novos liberados por dia de estudo (padrão do Anki). */
const NEW_PER_DAY = 20;

export interface FlashcardDto {
  id: string;
  pt: string;
  en: string;
  example: string | null;
  note: string | null;
  correctCount: number;
  wrongCount: number;
  lastReviewedAt: string | null;
  state: SrsState;
  intervalDays: number;
  /** Quando volta para a revisão; null = card novo. */
  dueAt: string | null;
  /** Em quantos minutos o card volta, para cada botão de avaliação. */
  nextIntervalMinutes: Record<Rating, number>;
  /** Legado (front antigo): o mesmo intervalo em dias, pode ser fracionário. */
  nextIntervalDays: Record<Rating, number>;
  createdAt: string;
}

export interface CreateFlashcardsResult {
  created: FlashcardDto[];
  /** Pares pt/en que já existiam (comparação sem diferenciar maiúsculas). */
  skipped: { pt: string; en: string }[];
}

function srsOf(card: Flashcard): SrsCard {
  const state = (SRS_STATES as readonly string[]).includes(card.srsState)
    ? (card.srsState as SrsState)
    : 'new';
  return {
    srsState: state,
    srsStep: card.srsStep,
    ease: card.ease,
    intervalDays: card.intervalDays,
    lapses: card.lapses,
  };
}

const toDays = (m: Record<Rating, number>): Record<Rating, number> => ({
  again: m.again / 1440,
  hard: m.hard / 1440,
  good: m.good / 1440,
  easy: m.easy / 1440,
});

function toDto(card: Flashcard): FlashcardDto {
  const srs = srsOf(card);
  const minutes = nextIntervalMinutes(srs);
  return {
    id: card.id,
    pt: card.pt,
    en: card.en,
    example: card.example,
    note: card.note,
    correctCount: card.correctCount,
    wrongCount: card.wrongCount,
    lastReviewedAt: card.lastReviewedAt?.toISOString() ?? null,
    state: srs.srsState,
    intervalDays: srs.intervalDays,
    dueAt: card.dueAt?.toISOString() ?? null,
    nextIntervalMinutes: minutes,
    nextIntervalDays: toDays(minutes),
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
    return cards.map((c) => toDto(c));
  }

  /**
   * Só o que venceu: primeiro os cards com revisão marcada (mais atrasados
   * antes), depois os novos na ordem em que chegaram — no máximo
   * NEW_PER_DAY novos por dia de estudo, como no Anki.
   */
  async reviewQueue(userId: string, limit: number): Promise<FlashcardDto[]> {
    const now = new Date();
    const due = await this.prisma.db.flashcard.findMany({
      where: { userId, dueAt: { lte: now } },
      orderBy: { dueAt: 'asc' },
      take: limit,
    });
    const room = limit - due.length;
    const fresh =
      room > 0 ? await this.newCardsForToday(userId, now, room) : [];
    return [...due, ...fresh].map((c) => toDto(c));
  }

  /** Novos ainda liberados hoje (NEW_PER_DAY menos os estudados pela 1ª vez hoje). */
  private async newCardsForToday(
    userId: string,
    now: Date,
    room: number,
  ): Promise<Flashcard[]> {
    // Card novo passa por várias revisões curtas no mesmo dia: conta como
    // "começado hoje" quem foi revisto hoje e ainda tem poucas revisões no total.
    const reviewedToday = await this.prisma.db.flashcard.findMany({
      where: { userId, lastReviewedAt: { gte: studyDayStart(now) } },
      select: { correctCount: true, wrongCount: true },
    });
    const studiedToday = reviewedToday.filter(
      (c) => c.correctCount + c.wrongCount <= LEARNING_STEPS.length,
    ).length;
    const take = Math.min(room, NEW_PER_DAY - studiedToday);
    if (take <= 0) return [];
    return this.prisma.db.flashcard.findMany({
      where: { userId, dueAt: null },
      orderBy: { createdAt: 'asc' },
      take,
    });
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
    return { created: created.map((c) => toDto(c)), skipped };
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
    { rating }: ReviewFlashcardInput,
  ): Promise<FlashcardDto> {
    const current = await this.findOwned(userId, id);
    const now = new Date();
    const next = schedule(srsOf(current), rating, now);
    const card = await this.prisma.db.flashcard.update({
      where: { id },
      data: {
        ...(rating === 'again'
          ? { wrongCount: { increment: 1 } }
          : { correctCount: { increment: 1 } }),
        srsState: next.srsState,
        srsStep: next.srsStep,
        ease: next.ease,
        intervalDays: next.intervalDays,
        lapses: next.lapses,
        dueAt: next.dueAt,
        lastReviewedAt: now,
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
