import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  addDays,
  addMonths,
  businessDay,
  businessDayStart,
  businessTime,
  dateToDay,
  dayToDate,
  monthOf,
} from '../common/time/business-time';
import type { Notification } from '../generated/prisma/client';
import { objectiveProgress } from '../objectives/objective-progress';
import { PrismaService } from '../prisma/prisma.service';
import { PushSenderService } from '../push/push-sender.service';
import { RecurringsService } from '../recurrings/recurrings.service';
import { challengeStatus } from '../challenges/challenge-status';
import {
  buildSignals,
  EVENT_KINDS,
  groupPush,
  isQuietTime,
  type BillSnap,
  type Severity,
  type Signal,
  type Snapshot,
} from './notification-rules';

export interface NotificationDto {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  url: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
}

export type NotificationFilter = 'all' | 'unread' | 'important';

function toDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    kind: n.kind,
    severity: n.severity,
    title: n.title,
    body: n.body,
    url: n.url,
    entityId: n.entityId,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Visível na central: situação ainda existe e a pessoa não dispensou. */
const VISIBLE = { resolvedAt: null, dismissedAt: null } as const;

/** Sincronização disparada pela própria tela: no máximo uma por minuto por usuário. */
const IN_APP_SYNC_INTERVAL_MS = 60_000;
const LIST_LIMIT = 100;

/**
 * Notification Engine: lê o estado de todas as features (tarefas, metas,
 * hábitos, desafios, finanças, estudos), roda as regras puras de
 * `notification-rules.ts` e mantém a central de notificações em dia — cria o
 * que é novo, atualiza o texto do que continua e resolve o que deixou de
 * existir. O push sai só pelo cron (`dispatchPush`), agrupado e fora do
 * horário de silêncio.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly lastInAppSync = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrings: RecurringsService,
    private readonly sender: PushSenderService,
  ) {}

  // ───────────────────────── central (rotas do usuário) ─────────────────────────

  async list(
    userId: string,
    filter: NotificationFilter,
  ): Promise<{ items: NotificationDto[]; unreadCount: number }> {
    await this.syncFromApp(userId);
    const where = {
      userId,
      ...VISIBLE,
      ...(filter === 'unread' ? { readAt: null } : {}),
      ...(filter === 'important'
        ? { severity: { in: ['urgent', 'important'] as Severity[] } }
        : {}),
    };
    const [items, unreadCount] = await Promise.all([
      this.prisma.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      }),
      this.countUnread(userId),
    ]);
    return { items: items.map(toDto), unreadCount };
  }

  async summary(userId: string): Promise<{ unread: number; urgent: number }> {
    await this.syncFromApp(userId);
    const [unread, urgent] = await Promise.all([
      this.countUnread(userId),
      this.prisma.db.notification.count({
        where: { userId, ...VISIBLE, readAt: null, severity: 'urgent' },
      }),
    ]);
    return { unread, urgent };
  }

  async markRead(userId: string, id: string): Promise<{ ok: true }> {
    const { count } = await this.prisma.db.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) await this.assertOwned(userId, id);
    return { ok: true };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.db.notification.updateMany({
      where: { userId, ...VISIBLE, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  /** Dispensar: some da central e não volta enquanto a situação continuar. */
  async dismiss(userId: string, id: string): Promise<{ ok: true }> {
    const now = new Date();
    const { count } = await this.prisma.db.notification.updateMany({
      where: { id, userId },
      data: { dismissedAt: now, readAt: now },
    });
    if (count === 0) throw new NotFoundException('Notificação não encontrada');
    return { ok: true };
  }

  /** Depois de uma ação rápida (concluir, marcar hábito): recalcula na hora. */
  async refresh(userId: string): Promise<{ unread: number; urgent: number }> {
    this.lastInAppSync.delete(userId);
    return this.summary(userId);
  }

  private countUnread(userId: string): Promise<number> {
    return this.prisma.db.notification.count({
      where: { userId, ...VISIBLE, readAt: null },
    });
  }

  private async assertOwned(userId: string, id: string): Promise<void> {
    const exists = await this.prisma.db.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Notificação não encontrada');
  }

  /**
   * Com o app aberto a central se atualiza sozinha; o que nasce aqui a pessoa
   * já está vendo, então não vira push. Falha aqui nunca derruba a listagem.
   */
  private async syncFromApp(userId: string): Promise<void> {
    const now = Date.now();
    const last = this.lastInAppSync.get(userId) ?? 0;
    if (now - last < IN_APP_SYNC_INTERVAL_MS) return;
    this.lastInAppSync.set(userId, now);
    try {
      await this.sync(userId, new Date(now), { inApp: true });
    } catch (error) {
      this.logger.warn(`Falha ao sincronizar notificações: ${String(error)}`);
    }
  }

  // ───────────────────────── motor ─────────────────────────

  /** Aplica os sinais atuais na central (cria / atualiza / reabre / resolve). */
  async sync(
    userId: string,
    now: Date,
    opts: { inApp: boolean },
  ): Promise<void> {
    const snapshot = await this.snapshot(userId, now);
    if (!snapshot) return;
    const signals = buildSignals(snapshot);
    const byKey = new Map(signals.map((s) => [s.key, s]));

    const existing = await this.prisma.db.notification.findMany({
      where: {
        userId,
        OR: [{ key: { in: [...byKey.keys()] } }, { resolvedAt: null }],
      },
    });
    const existingByKey = new Map(existing.map((n) => [n.key, n]));

    const wantsPush = (s: Signal) => s.push && !opts.inApp;

    // Novos: createMany + skipDuplicates aguenta cron e tela rodando juntos.
    const fresh = signals.filter((s) => !existingByKey.has(s.key));
    if (fresh.length > 0) {
      await this.prisma.db.notification.createMany({
        data: fresh.map((s) => ({
          userId,
          key: s.key,
          kind: s.kind,
          severity: s.severity,
          title: s.title,
          body: s.body,
          url: s.url,
          entityId: s.entityId,
          wantsPush: wantsPush(s),
        })),
        skipDuplicates: true,
      });
    }

    const updates: Promise<unknown>[] = [];
    for (const n of existing) {
      const s = byKey.get(n.key);
      if (!s) {
        // A situação deixou de existir: resolve (eventos ficam até ler/dispensar).
        if (!n.resolvedAt && !EVENT_KINDS.has(n.kind)) {
          updates.push(
            this.prisma.db.notification.update({
              where: { id: n.id },
              data: { resolvedAt: now },
            }),
          );
        }
        continue;
      }
      if (n.resolvedAt) {
        // Voltou a acontecer (ex.: tarefa reaberta): notificação nova de novo.
        updates.push(
          this.prisma.db.notification.update({
            where: { id: n.id },
            data: {
              ...this.content(s),
              resolvedAt: null,
              readAt: null,
              dismissedAt: null,
              pushedAt: null,
              wantsPush: wantsPush(s),
              createdAt: now,
            },
          }),
        );
        continue;
      }
      if (this.changed(n, s)) {
        updates.push(
          this.prisma.db.notification.update({
            where: { id: n.id },
            data: this.content(s),
          }),
        );
      }
    }
    await Promise.all(updates);
  }

  private content(s: Signal) {
    return {
      kind: s.kind,
      severity: s.severity,
      title: s.title,
      body: s.body,
      url: s.url,
      entityId: s.entityId,
    };
  }

  private changed(n: Notification, s: Signal): boolean {
    return (
      n.title !== s.title ||
      n.body !== s.body ||
      n.severity !== s.severity ||
      n.url !== s.url ||
      n.entityId !== s.entityId
    );
  }

  /**
   * Envia os pushes pendentes do usuário num aviso só. Fora do silêncio; o que
   * a pessoa já leu/dispensou ou que deixou de existir não é enviado.
   */
  async dispatchPush(userId: string, now: Date): Promise<number> {
    if (isQuietTime(businessTime(now))) return 0;
    const pending = await this.prisma.db.notification.findMany({
      where: {
        userId,
        ...VISIBLE,
        readAt: null,
        wantsPush: true,
        pushedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
    const payload = groupPush(pending);
    if (!payload) return 0;
    // Marca antes de enviar: falha de entrega não pode virar rajada no próximo ciclo.
    await this.prisma.db.notification.updateMany({
      where: { id: { in: pending.map((n) => n.id) } },
      data: { pushedAt: now },
    });
    const delivered = await this.sender.sendToUser(userId, payload);
    return delivered > 0 ? 1 : 0;
  }

  /**
   * Ciclo do cron: só quem tem aparelho inscrito precisa de push; quem não tem
   * é sincronizado quando abre o app. Um usuário com erro não para os outros.
   */
  async runAll(now: Date = new Date()): Promise<number> {
    const subscribers = await this.prisma.db.pushSubscription.findMany({
      distinct: ['userId'],
      select: { userId: true },
    });
    let dispatched = 0;
    for (const { userId } of subscribers) {
      try {
        await this.sync(userId, now, { inApp: false });
        dispatched += await this.dispatchPush(userId, now);
      } catch (error) {
        this.logger.warn(
          `Falha no ciclo de notificações (usuário ${userId}): ${String(error)}`,
        );
      }
    }
    await this.cleanup(now);
    return dispatched;
  }

  /** Histórico curto: resolvidas somem em 14 dias; lidas/dispensadas, em 30. */
  private async cleanup(now: Date): Promise<void> {
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    await this.prisma.db.notification.deleteMany({
      where: {
        OR: [
          { resolvedAt: { lt: days(14) } },
          {
            createdAt: { lt: days(30) },
            OR: [{ readAt: { not: null } }, { dismissedAt: { not: null } }],
          },
        ],
      },
    });
  }

  // ───────────────────────── foto do estado ─────────────────────────

  private async snapshot(userId: string, now: Date): Promise<Snapshot | null> {
    const today = businessDay(now);
    const todayDate = dayToDate(today);
    const isSunday = todayDate.getUTCDay() === 0;
    const weekStart = businessDayStart(addDays(today, -6));
    const db = this.prisma.db;

    const [
      user,
      tasks,
      objectives,
      goals,
      habits,
      challenges,
      flashcardsDue,
      bills,
      week,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { notificationDigestTime: true },
      }),
      db.task.findMany({
        where: { userId, done: false },
        select: { id: true, title: true, dueDate: true, priority: true },
      }),
      db.objective.findMany({
        where: {
          userId,
          OR: [
            { completedAt: null },
            { completedAt: { gte: new Date(now.getTime() - 4 * 86_400_000) } },
          ],
        },
        include: {
          milestones: { select: { done: true, doneAt: true } },
          tasks: { select: { done: true, doneAt: true } },
        },
      }),
      db.goal.findMany({ where: { userId } }),
      db.habit.findMany({
        where: { userId },
        include: { checks: { where: { day: todayDate } } },
      }),
      db.challenge.findMany({
        where: { userId, completedAt: null, abandonedAt: null },
        include: { checks: { where: { day: todayDate } } },
      }),
      db.flashcard.count({ where: { userId, dueAt: { lte: now } } }),
      this.bills(userId, today),
      isSunday
        ? Promise.all([
            db.task.count({ where: { userId, doneAt: { gte: weekStart } } }),
            db.habitCheck.count({
              where: {
                habit: { userId },
                day: { gte: dayToDate(addDays(today, -6)) },
              },
            }),
          ])
        : Promise.resolve(null),
    ]);
    if (!user) return null;

    return {
      today,
      nowTime: businessTime(now),
      now,
      digestTime: user.notificationDigestTime,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate ? dateToDay(t.dueDate) : null,
        priority: t.priority,
      })),
      objectives: objectives.map((o) => {
        const items = [...o.milestones, ...o.tasks];
        const activity = items
          .map((i) => i.doneAt?.getTime() ?? 0)
          .reduce((a, b) => Math.max(a, b), o.createdAt.getTime());
        return {
          id: o.id,
          title: o.title,
          deadline: o.deadline ? dateToDay(o.deadline) : null,
          completedAt: o.completedAt,
          progress: objectiveProgress(items, o.completedAt !== null),
          lastActivityAt: new Date(activity),
        };
      }),
      goals: goals.map((g) => ({
        id: g.id,
        name: g.name,
        targetCents: g.targetCents,
        savedCents: g.savedCents,
        deadline: g.deadline,
        completedAt: g.completedAt,
      })),
      habits: habits.map((h) => ({
        id: h.id,
        name: h.name,
        weekdays: h.weekdays,
        reminderTime: h.reminderTime,
        checkedToday: h.checks.length > 0,
      })),
      challenges: challenges
        .filter(
          (c) =>
            challengeStatus(
              {
                startDate: dateToDay(c.startDate),
                durationDays: c.durationDays,
                completed: false,
                abandoned: false,
              },
              today,
            ) === 'active',
        )
        .map((c) => ({
          id: c.id,
          title: c.title,
          checkedToday: c.checks.length > 0,
        })),
      bills,
      flashcardsDue,
      week: week ? { tasksDone: week[0], habitChecks: week[1] } : null,
    };
  }

  /** Contas (saídas recorrentes) não pagas: vencidas no mês passado/atual e as próximas. */
  private async bills(userId: string, today: string): Promise<BillSnap[]> {
    const month = monthOf(today);
    const [previous, current, upcoming] = await Promise.all([
      this.recurrings.list(userId, addMonths(month, -1)),
      this.recurrings.list(userId, month),
      this.recurrings.upcoming(userId, 3),
    ]);
    const seen = new Map<string, BillSnap>();
    for (const r of [...previous, ...current, ...upcoming]) {
      if (r.type !== 'expense' || !r.dueDate || r.status === 'paid') continue;
      seen.set(`${r.id}:${r.dueDate}`, {
        id: r.id,
        description: r.description,
        dueDate: r.dueDate,
        amountCents: r.amountCents,
      });
    }
    return [...seen.values()];
  }
}
