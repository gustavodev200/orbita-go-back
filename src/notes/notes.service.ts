import { Injectable, NotFoundException } from '@nestjs/common';
import { dayToDate } from '../common/time/business-time';
import type { Note } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type {
  CreateNoteInput,
  NoteItem,
  UpdateNoteInput,
} from './dto/note.schema';

export interface NoteDto {
  id: string;
  title: string;
  body: string;
  color: string;
  labels: string[];
  checklist: boolean;
  items: NoteItem[];
  pinned: boolean;
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toNoteDto(note: Note): NoteDto {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    color: note.color,
    labels: note.labels,
    checklist: note.checklist,
    items: Array.isArray(note.items) ? (note.items as NoteItem[]) : [],
    pinned: note.pinned,
    reminderAt: note.reminderAt,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/** Título do push: título da nota, senão a primeira linha/item com texto. */
export function noteReminderTitle(
  note: Pick<Note, 'title' | 'body' | 'checklist' | 'items'>,
): string {
  const items = Array.isArray(note.items) ? (note.items as NoteItem[]) : [];
  const fallback = note.checklist
    ? items.find((i) => i.text.trim())?.text
    : note.body.split('\n').find((l) => l.trim());
  const title = (note.title.trim() || fallback?.trim() || 'Nota').slice(0, 140);
  return title;
}

// Mantém o Reminder (kind='note', repeat='none') em sincronia com `Note.reminderAt`
// pra o cron de push (`DispatchRemindersService`) enxergar lembretes de nota.
async function syncReminder(tx: Tx, note: Note): Promise<void> {
  if (!note.reminderAt) {
    await tx.reminder.deleteMany({ where: { noteId: note.id } });
    return;
  }
  const date = dayToDate(note.reminderAt.slice(0, 10));
  const time = note.reminderAt.slice(11, 16);
  const title = noteReminderTitle(note);
  await tx.reminder.upsert({
    where: { noteId: note.id },
    create: {
      userId: note.userId,
      noteId: note.id,
      title,
      kind: 'note',
      repeat: 'none',
      time,
      date,
    },
    update: { title, time, date, enabled: true, lastFiredAt: null },
  });
}

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<NoteDto[]> {
    const notes = await this.prisma.db.note.findMany({
      where: { userId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
    return notes.map(toNoteDto);
  }

  async create(userId: string, dto: CreateNoteInput): Promise<NoteDto> {
    return this.prisma.transaction(async (tx) => {
      const note = await tx.note.create({
        data: { userId, ...dto, reminderAt: dto.reminderAt ?? null },
      });
      if (note.reminderAt) await syncReminder(tx, note);
      return toNoteDto(note);
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateNoteInput,
  ): Promise<NoteDto> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.findOwned(tx, userId, id);
      const updated = await tx.note.update({
        where: { id: current.id },
        data: dto,
      });
      const reminderTouched =
        dto.reminderAt !== undefined ||
        (updated.reminderAt &&
          (dto.title !== undefined ||
            dto.body !== undefined ||
            dto.items !== undefined ||
            dto.checklist !== undefined));
      if (reminderTouched) await syncReminder(tx, updated);
      return toNoteDto(updated);
    });
  }

  async remove(userId: string, id: string): Promise<NoteDto> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.findOwned(tx, userId, id);
      // FK `reminders.note_id` é ON DELETE CASCADE — o lembrete some junto.
      await tx.note.delete({ where: { id: current.id } });
      return toNoteDto(current);
    });
  }

  private async findOwned(tx: Tx, userId: string, id: string): Promise<Note> {
    const note = await tx.note.findFirst({ where: { id, userId } });
    if (!note) throw new NotFoundException('Nota não encontrada');
    return note;
  }
}
