import { z } from 'zod';
import { daySchema } from '../../common/schemas/common.schema';

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'cor deve ser #RRGGBB');
const milestoneTitleSchema = z.string().trim().min(1).max(120);

const objectiveFields = {
  title: z.string().trim().min(1).max(100),
  why: z.string().trim().max(300).nullable(),
  expectedResult: z.string().trim().max(200).nullable(),
  horizon: z.enum(['short', 'medium', 'long']),
  deadline: daySchema.nullable(),
  icon: z.string().trim().min(1).max(40),
  color: colorSchema,
};

export const createObjectiveSchema = z
  .object({
    ...objectiveFields,
    why: objectiveFields.why.optional(),
    expectedResult: objectiveFields.expectedResult.optional(),
    deadline: objectiveFields.deadline.optional(),
    /** Etapas iniciais, na ordem. */
    milestones: z.array(milestoneTitleSchema).max(30).optional(),
  })
  .strict();
export type CreateObjectiveInput = z.infer<typeof createObjectiveSchema>;

export const updateObjectiveSchema = z
  .object({ ...objectiveFields, completed: z.boolean() })
  .partial()
  .strict();
export type UpdateObjectiveInput = z.infer<typeof updateObjectiveSchema>;

export const createMilestoneSchema = z
  .object({ title: milestoneTitleSchema })
  .strict();
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z
  .object({ title: milestoneTitleSchema, done: z.boolean() })
  .partial()
  .strict();
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
