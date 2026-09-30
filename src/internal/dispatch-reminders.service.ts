import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import {
  businessDay,
  businessTime,
  dateToDay,
} from '../common/time/business-time';
import type { PushSubscription, Reminder } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isReminderDueOn } from '../reminders/reminder-due';

interface PushPayload {
  title: string;
  body: string;
  reminderId: string;
}

// Copy na "voz do Cobre" — porta o texto de notifTitle/notifBody da Tela Lembretes.
function buildPayload(reminder: Reminder): PushPayload {
  const finance = reminder.kind === 'finance';
  return {
    title: `Cobre: ${finance ? 'dia de derrotar um chefão!' : 'psiu, lembrete chegando!'}`,
    body: finance
      ? `Hoje é dia de ${reminder.title.toLowerCase()}. Paga em dia e ganha +10 XP.`
      : `${reminder.title} — bora riscar isso da lista? Vale +5 XP.`,
    reminderId: reminder.id,
  };
}

@Injectable()
export class DispatchRemindersService {
  private readonly logger = new Logger(DispatchRemindersService.name);

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

  /**
   * Varre lembretes habilitados cujo `time` bate com "agora" (minuto exato,
   * fuso de negócio), filtra os que realmente ocorrem hoje (repeat) e ainda
   * não dispararam hoje, envia Web Push e marca `lastFiredAt`.
   */
  async run(now: Date = new Date()): Promise<{ dispatched: number }> {
    const today = businessDay(now);
    const nowTime = businessTime(now);

    const candidates = await this.prisma.db.reminder.findMany({
      where: { enabled: true, time: nowTime },
    });

    let dispatched = 0;
    for (const reminder of candidates) {
      const due = isReminderDueOn(
        {
          repeat: reminder.repeat,
          dayOfMonth: reminder.dayOfMonth,
          weekday: reminder.weekday,
          date: reminder.date ? dateToDay(reminder.date) : null,
        },
        today,
      );
      if (!due) continue;
      // Dedupe: já processado nesta ocorrência (mesmo dia de negócio).
      if (reminder.lastFiredAt && businessDay(reminder.lastFiredAt) === today) {
        continue;
      }

      const subscriptions = await this.prisma.db.pushSubscription.findMany({
        where: { userId: reminder.userId },
      });

      if (subscriptions.length > 0) {
        dispatched += 1;
        const payload = JSON.stringify(buildPayload(reminder));
        await Promise.all(
          subscriptions.map((subscription) => this.send(subscription, payload)),
        );
      }

      await this.prisma.db.reminder.update({
        where: { id: reminder.id },
        data: { lastFiredAt: now },
      });
    }

    return { dispatched };
  }

  private async send(
    subscription: PushSubscription,
    payload: string,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
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
    }
  }
}
