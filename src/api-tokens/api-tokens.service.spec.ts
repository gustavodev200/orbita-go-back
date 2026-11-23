import type { PrismaService } from '../prisma/prisma.service';
import { ApiTokensService, hashToken } from './api-tokens.service';

function buildPrisma() {
  const db = {
    apiToken: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 't1',
          lastUsedAt: null,
          createdAt: new Date(),
          ...data,
        }),
      ),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  return { db, prisma: { db } as unknown as PrismaService };
}

describe('ApiTokensService', () => {
  it('cria token orb_… e salva só o hash', async () => {
    const { db, prisma } = buildPrisma();
    const service = new ApiTokensService(prisma);

    const created = await service.create('u1', 'Claude Code');

    expect(created.token).toMatch(/^orb_[A-Za-z0-9_-]{43}$/);
    expect(created.prefix).toBe(created.token.slice(0, 12));
    const { data } = db.apiToken.create.mock.calls[0][0];
    expect(data.tokenHash).toBe(hashToken(created.token));
    expect(JSON.stringify(data)).not.toContain(created.token);
  });

  it('autentica pelo hash e devolve o dono', async () => {
    const { db, prisma } = buildPrisma();
    db.apiToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      lastUsedAt: new Date(),
    });
    const service = new ApiTokensService(prisma);

    await expect(service.authenticate('orb_abc')).resolves.toBe('u1');
    expect(db.apiToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('orb_abc') },
    });
    // Usado há menos de 1 min: não regrava lastUsedAt.
    expect(db.apiToken.update).not.toHaveBeenCalled();
  });

  it('recusa token desconhecido ou sem prefixo sem tocar no banco à toa', async () => {
    const { db, prisma } = buildPrisma();
    db.apiToken.findUnique.mockResolvedValue(null);
    const service = new ApiTokensService(prisma);

    await expect(service.authenticate('orb_nope')).resolves.toBeNull();
    await expect(service.authenticate('eyJhbGciOi.jwt')).resolves.toBeNull();
    expect(db.apiToken.findUnique).toHaveBeenCalledTimes(1);
  });
});
