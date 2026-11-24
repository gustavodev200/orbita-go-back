import { z } from 'zod';
import { daySchema } from '../../common/schemas/common.schema';

const lifeEventFields = {
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable(),
  date: daySchema,
  kind: z.enum(['achievement', 'project', 'milestone']),
  icon: z.string().trim().min(1).max(40),
};

export const createLifeEventSchema = z
  .object({
    ...lifeEventFields,
    description: lifeEventFields.description.optional(),
  })
  .strict();
export type CreateLifeEventInput = z.infer<typeof createLifeEventSchema>;

export const updateLifeEventSchema = z
  .object(lifeEventFields)
  .partial()
  .strict();
export type UpdateLifeEventInput = z.infer<typeof updateLifeEventSchema>;
