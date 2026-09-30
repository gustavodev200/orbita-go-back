import { z } from 'zod';
import {
  centsSchema,
  daySchema,
  monthSchema,
  uuidParamSchema,
} from '../../common/schemas/common.schema';
import {
  frequencySchema,
  transactionTypeSchema,
} from '../../recurrings/dto/recurring.schema';
import { categoryKeySchema } from '../../users/dto/me.schema';

const transactionFields = {
  type: transactionTypeSchema,
  amountCents: centsSchema,
  description: z.string().trim().min(1).max(120),
  categoryKey: categoryKeySchema,
  date: daySchema,
  accountId: uuidParamSchema,
};

export const createTransactionSchema = z
  .object({
    ...transactionFields,
    recurring: z
      .object({
        frequency: frequencySchema,
        dueDay: z.number().int().min(1).max(31),
        endDate: daySchema.nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z
  .object({
    ...transactionFields,
    accountId: uuidParamSchema.nullable(),
  })
  .partial()
  .strict();
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const listTransactionsQuerySchema = z.object({
  month: monthSchema.optional(),
  type: transactionTypeSchema.optional(),
  category: categoryKeySchema.optional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
