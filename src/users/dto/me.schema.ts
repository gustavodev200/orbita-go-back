import { z } from 'zod';
import { CATEGORY_KEYS } from '../../categories/categories';

export const categoryKeySchema = z
  .string()
  .refine((key) => CATEGORY_KEYS.includes(key), 'categoria inválida');

export const categoryKeysSchema = z
  .array(categoryKeySchema)
  .max(CATEGORY_KEYS.length)
  .transform((keys) => [...new Set(keys)]);

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    monthlyIncomeCents: z
      .number()
      .int()
      .nonnegative()
      .max(1_000_000_000)
      .nullable()
      .optional(),
    enabledCategoryKeys: categoryKeysSchema.optional(),
    notificationsEnabled: z.boolean().optional(),
  })
  .strict();

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
