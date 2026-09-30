import { z } from 'zod';
import { centsSchema, monthSchema } from '../../common/schemas/common.schema';

export const goalSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    targetCents: centsSchema,
    icon: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,40}$/, 'ícone inválido'),
    // Prazo opcional definido pelo usuário — mês/ano (YYYY-MM), não um dia exato.
    deadline: monthSchema.nullable().optional(),
  })
  .strict();
export type GoalInput = z.infer<typeof goalSchema>;

export const updateGoalSchema = goalSchema.partial().strict();
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const depositSchema = z.object({ amountCents: centsSchema }).strict();
export type DepositInput = z.infer<typeof depositSchema>;
