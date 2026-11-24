import { z } from 'zod';
import { RATINGS } from '../srs';

/** Trim + espaços internos colapsados — "dona  de casa " vira "dona de casa". */
const text = (max: number) =>
  z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1).max(max));

const optionalText = (max: number) =>
  z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().max(max))
    .transform((value) => (value ? value : null))
    .nullable()
    .optional();

export const flashcardFields = {
  pt: text(120),
  en: text(120),
  example: optionalText(300),
  note: optionalText(300),
};

export const flashcardInputSchema = z.object(flashcardFields).strict();
export type FlashcardInput = z.infer<typeof flashcardInputSchema>;

/** Criação em lote: 1..50 cards (uma conversa raramente gera mais). */
export const createFlashcardsSchema = z
  .object({ cards: z.array(flashcardInputSchema).min(1).max(50) })
  .strict();
export type CreateFlashcardsInput = z.infer<typeof createFlashcardsSchema>;

export const updateFlashcardSchema = z
  .object(flashcardFields)
  .partial()
  .strict();
export type UpdateFlashcardInput = z.infer<typeof updateFlashcardSchema>;

/**
 * Avaliação do card: again (Esqueci), hard (Difícil), good (Lembrei), easy (Fácil).
 * `result` (correct/wrong) é o formato antigo — aceito enquanto front antigo existir.
 */
export const reviewFlashcardSchema = z.union([
  z.object({ rating: z.enum(RATINGS) }).strict(),
  z
    .object({ result: z.enum(['correct', 'wrong']) })
    .strict()
    .transform(({ result }) => ({
      rating: result === 'correct' ? ('good' as const) : ('again' as const),
    })),
]);
export type ReviewFlashcardInput = z.infer<typeof reviewFlashcardSchema>;

export const listFlashcardsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
});
export type ListFlashcardsQuery = z.infer<typeof listFlashcardsQuerySchema>;

export const reviewQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ReviewQueueQuery = z.infer<typeof reviewQueueQuerySchema>;
