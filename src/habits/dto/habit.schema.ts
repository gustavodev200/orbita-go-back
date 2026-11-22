import { z } from 'zod';
import { daySchema, timeSchema } from '../../common/schemas/common.schema';

const weekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, {
    message: 'dias da semana repetidos',
  })
  .transform((days) => [...days].sort((a, b) => a - b));

const habitFields = {
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor deve ser #RRGGBB'),
  weekdays: weekdaysSchema,
  reminderTime: timeSchema.nullable(),
};

export const createHabitSchema = z
  .object({
    ...habitFields,
    weekdays: habitFields.weekdays.optional(),
    reminderTime: habitFields.reminderTime.optional(),
  })
  .strict();
export type CreateHabitInput = z.infer<typeof createHabitSchema>;

export const updateHabitSchema = z.object(habitFields).partial().strict();
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;

export const habitDayParamSchema = daySchema;
