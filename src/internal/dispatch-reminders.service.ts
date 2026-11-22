import { Injectable } from '@nestjs/common';
import {
  businessDay,
  businessTime,
  dateToDay,
} from '../common/time/business-time';
import type { Reminder } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PushSenderService,
  type PushPayload,
} from '../push/push-sender.service';
import { isInDispatchWindow, isReminderDueOn } from '../reminders/reminder-due';

/** Texto da notificação: o próprio lembrete é o título; o corpo diz quando. */
export function buildReminderPayload(reminder: Reminder): PushPayload {
  const finance = reminder.kind === 'finance';
  return {
    title: reminder.title,
    body: `${finance ? 'Finanças' : 'Lembrete'} · hoje às ${reminder.time}`,
    url: '/agenda',
    tag: `reminder-${reminder.id}`,
  };
}

@Injectable()
export class DispatchRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: PushSenderService,
  ) {}

  /**
   * Varre lembretes habilitados cujo horário já chegou (dentro da janela de
   * recuperação — o cron roda a cada ~5 min e pode atrasar), filtra os que
   * realmente ocorrem hoje (repeat) e ainda não dispararam hoje, envia Web
   * Push e marca `lastFiredAt`.
   */
  async run(now: Date = new Date()): Promise<{ dispatched: number }> {
    const today = businessDay(now);
    const nowTime = businessTime(now);

    // `time` é "HH:mm" com zero à esquerda: comparação de string = cronológica.
    const candidates = await this.prisma.db.reminder.findMany({
      where: { enabled: true, time: { lte: nowTime } },
    });

    let dispatched = 0;
    for (const reminder of candidates) {
      if (!isInDispatchWindow(reminder.time, nowTime)) continue;
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

      const delivered = await this.sender.sendToUser(
        reminder.userId,
        buildReminderPayload(reminder),
      );
      if (delivered > 0) dispatched += 1;

      await this.prisma.db.reminder.update({
        where: { id: reminder.id },
        data: { lastFiredAt: now },
      });
    }

    return { dispatched };
  }
}
