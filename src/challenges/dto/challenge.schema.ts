import { z } from 'zod';
import { daySchema } from '../../common/schemas/common.schema';

const challengeFields = {
  title: z.string().trim().min(1).max(80),
  why: z.string().trim().max(300).nullable(),
  icon: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor deve ser #RRGGBB'),
};

export const createChallengeSchema = z
  .object({
    ...challengeFields,
    why: challengeFields.why.optional(),
    durationDays: z.union([z.literal(7), z.literal(21), z.literal(30)]),
    /** Padrão: hoje. Aceita até 30 dias antes/depois (começou ontem, começa segunda). */
    startDate: daySchema.optional(),
  })
  .strict();
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;

export const updateChallengeSchema = z
  .object({ ...challengeFields, abandoned: z.boolean() })
  .partial()
  .strict();
export type UpdateChallengeInput = z.infer<typeof updateChallengeSchema>;

export const challengeDayParamSchema = daySchema;
