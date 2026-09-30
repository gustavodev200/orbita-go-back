import { z } from 'zod';

export const uuidParamSchema = z.string().uuid('id inválido');

export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: 'data inválida',
  });

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mês deve ser YYYY-MM');

export const monthQuerySchema = z.object({ month: monthSchema.optional() });
export type MonthQuery = z.infer<typeof monthQuerySchema>;

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'horário deve ser HH:mm');

export const centsSchema = z.number().int().positive().max(1_000_000_000);

export const textParseSchema = z.object({
  text: z.string().trim().min(1).max(300),
});
export type TextParseInput = z.infer<typeof textParseSchema>;
