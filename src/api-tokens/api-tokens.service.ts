import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { ApiToken } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TOKEN_PREFIX = 'orb_';
/** Quantos caracteres do token ficam visíveis na lista (ex.: `orb_AbCd1234`). */
const VISIBLE_CHARS = TOKEN_PREFIX.length + 8;
const MAX_TOKENS_PER_USER = 10;
/** `lastUsedAt` só é regravado se estiver mais velho que isso (evita 1 write por chamada). */
const LAST_USED_RESOLUTION_MS = 60_000;

export interface ApiTokenDto {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiTokenDto extends ApiTokenDto {
  /** Valor em claro — devolvido só na criação, nunca salvo. */
  token: string;
}

function toDto(token: ApiToken): ApiTokenDto {
  return {
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
  };
}

/** 32 bytes aleatórios: SHA-256 puro basta (não é senha escolhida por humano). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class ApiTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ApiTokenDto[]> {
    const tokens = await this.prisma.db.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return tokens.map(toDto);
  }

  async create(userId: string, name: string): Promise<CreatedApiTokenDto> {
    const count = await this.prisma.db.apiToken.count({ where: { userId } });
    if (count >= MAX_TOKENS_PER_USER) {
      throw new BadRequestException(
        `limite de ${MAX_TOKENS_PER_USER} tokens — revogue um antes`,
      );
    }
    const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const saved = await this.prisma.db.apiToken.create({
      data: {
        userId,
        name,
        tokenHash: hashToken(token),
        prefix: token.slice(0, VISIBLE_CHARS),
      },
    });
    return { ...toDto(saved), token };
  }

  async remove(userId: string, id: string): Promise<ApiTokenDto> {
    const token = await this.prisma.db.apiToken.findFirst({
      where: { id, userId },
    });
    if (!token) throw new NotFoundException('Token não encontrado');
    await this.prisma.db.apiToken.delete({ where: { id } });
    return toDto(token);
  }

  /** Devolve o dono do token, ou `null` se não existe / foi revogado. */
  async authenticate(token: string): Promise<string | null> {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const found = await this.prisma.db.apiToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!found) return null;
    const now = Date.now();
    if (
      !found.lastUsedAt ||
      now - found.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
    ) {
      await this.prisma.db.apiToken.update({
        where: { id: found.id },
        data: { lastUsedAt: new Date(now) },
      });
    }
    return found.userId;
  }
}
