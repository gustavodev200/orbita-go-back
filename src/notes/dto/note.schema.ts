import { z } from 'zod';

export const NOTE_COLORS = [
  'default',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;

const noteItemSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    text: z.string().max(500),
    done: z.boolean(),
  })
  .strict();
export type NoteItem = z.infer<typeof noteItemSchema>;

const labelSchema = z.string().trim().toLowerCase().min(1).max(30);

const noteFields = {
  title: z.string().trim().max(140),
  body: z.string().max(5000),
  color: z.enum(NOTE_COLORS),
  labels: z
    .array(labelSchema)
    .max(10)
    .transform((labels) => [...new Set(labels)]),
  checklist: z.boolean(),
  items: z.array(noteItemSchema).max(100),
  pinned: z.boolean(),
  /** Datetime ISO com offset ("2026-11-25T09:00:00-03:00"); null remove o lembrete. */
  reminderAt: z.string().datetime({ offset: true }).nullable(),
};

export const createNoteSchema = z
  .object(noteFields)
  .partial()
  .strict()
  .refine(
    (n) =>
      !!n.title?.trim() ||
      !!n.body?.trim() ||
      (n.items ?? []).some((i) => i.text.trim()),
    { message: 'nota vazia' },
  );
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z.object(noteFields).partial().strict();
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
