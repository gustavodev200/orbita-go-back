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

export const taskStatusSchema = z.enum(['backlog', 'todo', 'doing', 'done']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const createTaskSchema = z
  .object({ ...taskFields, status: taskStatusSchema.optional() })
  .strict();
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object(taskFields).partial().strict();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Mover card no quadro: coluna de destino e, opcionalmente, a posição (sem = fim da coluna). */
export const moveTaskSchema = z
  .object({
    status: taskStatusSchema,
    position: z.number().finite().optional(),
  })
  .strict();
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
