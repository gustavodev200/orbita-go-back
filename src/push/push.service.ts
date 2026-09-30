import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SubscribeInput } from './dto/push-subscription.schema';

// Upsert/remoção de inscrições de Web Push — a lógica de envio (VAPID, disparo,
// limpeza de subscription morta) fica em internal/dispatch-reminders.service.ts.
@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(userId: string, dto: SubscribeInput): Promise<{ ok: true }> {
    // Upsert por endpoint: o mesmo dispositivo pode reassinar (ex.: trocou de
    // usuário no navegador) sem acumular linhas duplicadas.
    await this.prisma.db.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: {
        userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<{ ok: true }> {
    // deleteMany (não delete): idempotente — endpoint já removido ou de outro
    // usuário não deve estourar 404/403, só não remove nada.
    await this.prisma.db.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
    return { ok: true };
  }
}
