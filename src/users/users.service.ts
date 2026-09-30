import { Injectable } from '@nestjs/common';
import { DEFAULT_ENABLED_CATEGORY_KEYS } from '../categories/categories';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateMeInput } from './dto/me.schema';
import { toMe, type Me } from './me';

export interface TokenIdentity {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

// Contas padrão criadas junto com o usuário (design: Nubank, Itaú, Carteira).
// Cores = paleta de marca usada no mock (Novo Lançamento), fixas por conta seedada.
const DEFAULT_ACCOUNTS = [
  { name: 'Nubank', icon: 'credit_card', color: '#8A05BE', position: 0 },
  { name: 'Itaú', icon: 'account_balance', color: '#EC7000', position: 1 },
  {
    name: 'Carteira',
    icon: 'account_balance_wallet',
    color: '#20B878',
    position: 2,
  },
];

@Injectable()
export class UsersService {
  // Cache por instância (serverless "quente"): evita 1 query por request após o 1º.
  private readonly known = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async ensureUser(identity: TokenIdentity): Promise<void> {
    if (this.known.has(identity.id)) {
      return;
    }
    const existing = await this.prisma.db.user.findUnique({
      where: { id: identity.id },
      select: { email: true, avatarUrl: true },
    });

    if (existing) {
      // Nome é editável no app (onboarding/PATCH /me): nunca sobrescrever pelo token.
      if (
        existing.email !== identity.email ||
        (identity.avatarUrl && existing.avatarUrl !== identity.avatarUrl)
      ) {
        await this.prisma.db.user.update({
          where: { id: identity.id },
          data: {
            email: identity.email,
            avatarUrl: identity.avatarUrl ?? existing.avatarUrl,
          },
        });
      }
    } else {
      try {
        await this.prisma.db.user.create({
          data: {
            id: identity.id,
            email: identity.email,
            name: identity.name,
            avatarUrl: identity.avatarUrl,
            enabledCategoryKeys: DEFAULT_ENABLED_CATEGORY_KEYS,
            accounts: { create: DEFAULT_ACCOUNTS },
          },
        });
      } catch (error) {
        // Dois requests simultâneos no 1º login: o outro já criou.
        if (!(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )) {
          throw error;
        }
      }
    }
    this.known.add(identity.id);
  }

  async getMe(userId: string): Promise<Me> {
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return toMe(user);
  }

  async updateMe(userId: string, dto: UpdateMeInput): Promise<Me> {
    const user = await this.prisma.db.user.update({
      where: { id: userId },
      data: dto,
    });
    return toMe(user);
  }
}
