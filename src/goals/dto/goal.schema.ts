import { z } from 'zod';
import { centsSchema, daySchema } from '../../common/schemas/common.schema';

const goalShape = z.object({
  name: z.string().trim().min(1).max(60),
  targetCents: centsSchema,
  icon: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,40}$/, 'ícone inválido'),
  // Prazo opcional definido pelo usuário — dia exato (YYYY-MM-DD). Metas
  // antigas podem ter só "YYYY-MM" salvo (formato anterior); back e front
  // tratam esse caso lendo o dia como 01.
  deadline: daySchema.nullable().optional(),
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

export const goalSchema = goalShape
  .extend({
    // Quanto o usuário já tinha guardado antes de criar a meta no app (backfill,
    // não é um depósito — não gera XP/conquista). Ausente = começa do zero
    // (coluna não aceita null, só omitir usa o default do banco).
    savedCents: centsSchema.optional(),
  })
  .strict()
  .refine(installmentFitsTarget, {
    message: 'parcela não pode ser maior que a meta',
    path: ['installmentCents'],
  })
  .refine((v) => v.savedCents == null || v.savedCents <= v.targetCents, {
    message: 'valor guardado não pode ser maior que a meta',
    path: ['savedCents'],
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
