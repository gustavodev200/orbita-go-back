import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { createNoteSchema, updateNoteSchema } from './dto/note.schema';
import { NotesService, noteReminderTitle } from './notes.service';

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    userId: 'u1',
    title: '',
    body: 'comprar pão',
    color: 'default',
    labels: [],
    checklist: false,
    items: [],
    pinned: false,
    reminderAt: null,
    createdAt: new Date('2026-11-24T12:00:00Z'),
    updatedAt: new Date('2026-11-24T12:00:00Z'),
    ...overrides,
  };
}

function buildPrisma(existing: ReturnType<typeof note> | null = note()) {
  const tx = {
    note: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(note(data)),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(note({ ...existing, ...data })),
      ),
      delete: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(existing),
    },
    reminder: { upsert: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = {
    db: tx,
    transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  return { tx, service: new NotesService(prisma) };
}

describe('note schemas', () => {
  it('recusa nota sem título, texto nem itens', () => {
    expect(createNoteSchema.safeParse({ title: ' ' }).success).toBe(false);
    expect(
      createNoteSchema.safeParse({
        checklist: true,
        items: [{ id: 'a', text: 'leite', done: false }],
      }).success,
    ).toBe(true);
  });

  it('normaliza etiquetas (minúsculas, sem repetidas)', () => {
    const parsed = updateNoteSchema.parse({ labels: ['Ideias', 'ideias '] });
    expect(parsed.labels).toEqual(['ideias']);
  });

  it('recusa cor fora da paleta', () => {
    expect(updateNoteSchema.safeParse({ color: '#fff' }).success).toBe(false);
  });
});

describe('noteReminderTitle', () => {
  it('usa título, senão primeira linha, senão primeiro item', () => {
    expect(noteReminderTitle(note({ title: 'Mercado' }))).toBe('Mercado');
    expect(noteReminderTitle(note({ body: '\n  ligar pro João\nresto' }))).toBe(
      'ligar pro João',
    );
    expect(
      noteReminderTitle(
        note({
          checklist: true,
          items: [
            { id: 'a', text: ' ', done: false },
            { id: 'b', text: 'ovos', done: false },
          ],
        }),
      ),
    ).toBe('ovos');
  });
});

describe('NotesService', () => {
  it('cria lembrete espelho quando a nota tem reminderAt', async () => {
    const { tx, service } = buildPrisma();
    await service.create('u1', {
      body: 'pagar boleto',
      reminderAt: '2026-11-25T09:30:00-03:00',
    });
    expect(tx.reminder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'note',
          repeat: 'none',
          time: '09:30',
          title: 'pagar boleto',
        }) as object,
      }),
    );
  });

  it('remove o lembrete ao limpar reminderAt', async () => {
    const { tx, service } = buildPrisma(
      note({ reminderAt: '2026-11-25T09:30:00-03:00' }),
    );
    await service.update('u1', 'n1', { reminderAt: null });
    expect(tx.reminder.deleteMany).toHaveBeenCalledWith({
      where: { noteId: 'n1' },
    });
  });

  it('não mexe no lembrete quando só muda cor/fixação', async () => {
    const { tx, service } = buildPrisma(
      note({ reminderAt: '2026-11-25T09:30:00-03:00' }),
    );
    await service.update('u1', 'n1', { pinned: true, color: 'yellow' });
    expect(tx.reminder.upsert).not.toHaveBeenCalled();
    expect(tx.reminder.deleteMany).not.toHaveBeenCalled();
  });

  it('nota de outro usuário → 404', async () => {
    const { service } = buildPrisma(null);
    await expect(service.remove('u2', 'n1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
