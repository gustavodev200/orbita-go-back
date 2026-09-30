import { z } from 'zod';
import { centsSchema, monthSchema } from '../../common/schemas/common.schema';

const goalShape = z.object({
  name: z.string().trim().min(1).max(60),
  targetCents: centsSchema,
  icon: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,40}$/, 'ícone inválido'),
  // Prazo opcional definido pelo usuário — mês/ano (YYYY-MM), não um dia exato.
  deadline: monthSchema.nullable().optional(),
  // Quanto guardar por vez (modo manual). Nulo/ausente = gerado (target/10).
  installmentCents: centsSchema.nullable().optional(),
});

const installmentFitsTarget = (v: {
  targetCents?: number;
  installmentCents?: number | null;
}) =>
  v.installmentCents == null ||
  v.targetCents == null ||
  v.installmentCents <= v.targetCents;

export const goalSchema = goalShape.strict().refine(installmentFitsTarget, {
  message: 'parcela não pode ser maior que a meta',
  path: ['installmentCents'],
});
export type GoalInput = z.infer<typeof goalSchema>;

export const updateGoalSchema = goalShape
  .partial()
  .strict()
  .refine(installmentFitsTarget, {
    message: 'parcela não pode ser maior que a meta',
    path: ['installmentCents'],
  });
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const depositSchema = z.object({ amountCents: centsSchema }).strict();
export type DepositInput = z.infer<typeof depositSchema>;
