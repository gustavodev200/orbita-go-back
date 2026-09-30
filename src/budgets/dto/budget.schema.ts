import { z } from 'zod';
import { centsSchema } from '../../common/schemas/common.schema';
import { categoryKeySchema } from '../../users/dto/me.schema';

export const putBudgetsSchema = z
  .object({
    items: z
      .array(
        z.object({ categoryKey: categoryKeySchema, limitCents: centsSchema }),
      )
      .max(20),
  })
  .strict();
export type PutBudgetsInput = z.infer<typeof putBudgetsSchema>;
