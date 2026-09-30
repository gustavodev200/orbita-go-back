import { z } from 'zod';
import { goalSchema } from '../../goals/dto/goal.schema';
import { categoryKeysSchema } from '../../users/dto/me.schema';

export const onboardingSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    monthlyIncomeCents: z
      .number()
      .int()
      .nonnegative()
      .max(1_000_000_000)
      .nullable()
      .optional(),
    categoryKeys: categoryKeysSchema,
    goal: goalSchema.nullable().optional(),
  })
  .strict();
export type OnboardingInput = z.infer<typeof onboardingSchema>;
