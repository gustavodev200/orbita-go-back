import { z } from 'zod';
import { daySchema, timeSchema } from '../../common/schemas/common.schema';

const reminderFields = {
  title: z.string().trim().min(1).max(140),
  kind: z.enum(['finance', 'task']),
  time: timeSchema,
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly']),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  date: daySchema.nullable().optional(),
  enabled: z.boolean().optional(),
};

export const createReminderSchema = z.object(reminderFields).strict();
export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export const updateReminderSchema = z.object(reminderFields).partial().strict();
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
