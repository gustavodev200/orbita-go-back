import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import type { PushSubscription } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Corpo que o service worker do front (`public/sw.js`) entende. */
export interface PushPayload {
  title: string;
  body: string;
  /** Rota aberta ao tocar na notificação. */
  url?: string;
  /** Notificações com a mesma tag se substituem em vez de empilhar. */
  tag?: string;
}

/**
 * Envio de Web Push (VAPID) para todas as inscrições de um usuário. Usado pelo
 * cron de lembretes e pela notificação de teste do Perfil/Agenda.
 */
@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    webpush.setVapidDetails(
      config.getOrThrow<string>('VAPID_SUBJECT'),
      config.getOrThrow<string>('VAPID_PUBLIC_KEY'),
      config.getOrThrow<string>('VAPID_PRIVATE_KEY'),
    );
  }

  /** Envia para todos os dispositivos do usuário; devolve quantos aceitaram. */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    const subscriptions = await this.prisma.db.pushSubscription.findMany({
      where: { userId },
    });
    const body = JSON.stringify(payload);
    const results = await Promise.all(
      subscriptions.map((subscription) => this.send(subscription, body)),
    );
    return results.filter(Boolean).length;
  }

  private async send(
    subscription: PushSubscription,
    payload: string,
  ): Promise<boolean> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
      return true;
    } catch (error) {
      // 404/410 = endpoint não existe mais (navegador desinstalado, subscription
      // revogada) — limpa para não tentar de novo a cada disparo futuro.
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.prisma.db.pushSubscription
          .delete({ where: { id: subscription.id } })
          .catch(() => undefined);
      } else {
        this.logger.warn(
          `Falha ao enviar push (subscription ${subscription.id}): ${String(error)}`,
        );
      }
      return false;
    }
  }
}
