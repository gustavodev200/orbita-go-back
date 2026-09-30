import { z } from 'zod';
import { CATEGORY_KEYS } from '../../categories/categories';
import {
  centsSchema,
  daySchema,
  uuidParamSchema,
} from '../../common/schemas/common.schema';

export const frequencySchema = z.enum(['monthly', 'weekly', 'yearly']);
export const transactionTypeSchema = z.enum(['expense', 'income']);

const recurringFields = {
  description: z.string().trim().min(1).max(120),
  amountCents: centsSchema,
  categoryKey: z
    .string()
    .refine((key) => CATEGORY_KEYS.includes(key), 'categoria inválida'),
  type: transactionTypeSchema,
  frequency: frequencySchema,
  dueDay: z.number().int().min(1).max(31),
  endDate: daySchema.nullable().optional(),
  accountId: uuidParamSchema.nullable().optional(),
};

export const createRecurringSchema = z.object(recurringFields).strict();
export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;

export const updateRecurringSchema = z
  .object(recurringFields)
  .partial()
  .strict();
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;

export const upcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(60).default(7),
});
export type UpcomingQuery = z.infer<typeof upcomingQuerySchema>;
