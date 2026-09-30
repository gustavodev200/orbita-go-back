import { z } from 'zod';
import { daySchema, timeSchema } from '../../common/schemas/common.schema';

// Lembrete da tarefa: "HH:mm" ou datetime ISO.
const reminderAtSchema = z.union([
  timeSchema,
  z.string().datetime({ offset: true }),
]);

const taskFields = {
  title: z.string().trim().min(1).max(140),
  dueDate: daySchema.nullable().optional(),
  priority: z.enum(['high', 'medium', 'low']),
  reminderAt: reminderAtSchema.nullable().optional(),
};

export const createTaskSchema = z.object(taskFields).strict();
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object(taskFields).partial().strict();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
