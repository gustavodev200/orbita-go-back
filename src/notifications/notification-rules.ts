import { addDays, diffDays, weekdayOf } from '../common/time/business-time';

/**
 * Motor de regras da central de notificações — funções puras.
 *
 * Recebe uma "foto" do estado do usuário e devolve os SINAIS que merecem
 * atenção agora. Cada sinal tem uma `key` estável que identifica a situação
 * (não o momento): enquanto a situação existir, o sinal se repete a cada ciclo
 * e o serviço só atualiza o texto — nunca cria outra notificação nem repete o
 * push. Quando o sinal some (tarefa concluída, conta paga, hábito marcado), a
 * notificação é resolvida e sai da central.
 */

export type Severity = 'urgent' | 'important' | 'info';

export type NotificationKind =
  | 'task_overdue'
  | 'task_due_today'
  | 'tasks_today'
  | 'objective_overdue'
  | 'objective_due_soon'
  | 'objective_stale'
  | 'objective_done'
  | 'goal_done'
  | 'goal_near'
  | 'goal_overdue'
  | 'habit_pending'
  | 'challenge_checkin'
  | 'bill_overdue'
  | 'bill_due'
  | 'bill_soon'
  | 'flashcards_due'
  | 'weekly_review'
  | 'daily_digest';

/** Eventos (conquistas, resumo semanal): não "deixam de existir" — ficam até ler/dispensar. */
export const EVENT_KINDS: ReadonlySet<string> = new Set<NotificationKind>([
  'objective_done',
  'goal_done',
  'weekly_review',
]);

export interface Signal {
  key: string;
  kind: NotificationKind;
  severity: Severity;
  title: string;
  body: string;
  url: string;
  /** Alvo das ações rápidas quando o sinal fala de um registro só. */
  entityId: string | null;
  /** Merece interromper (push)? Informativos ficam só na central. */
  push: boolean;
}

export interface TaskSnap {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  dueDate: string | null;
  priority: 'high' | 'medium' | 'low';
}

export interface ObjectiveSnap {
  id: string;
  title: string;
  deadline: string | null;
  completedAt: Date | null;
  progress: number;
  /** Última movimentação (etapa/tarefa concluída) ou a criação. */
  lastActivityAt: Date;
}

export interface GoalSnap {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  /** YYYY-MM */
  deadline: string | null;
  completedAt: Date | null;
}

export interface HabitSnap {
  id: string;
  name: string;
  weekdays: number[];
  reminderTime: string | null;
  checkedToday: boolean;
}

export interface ChallengeSnap {
  id: string;
  title: string;
  checkedToday: boolean;
}

export interface BillSnap {
  id: string;
  description: string;
  dueDate: string;
  amountCents: number;
}

export interface Snapshot {
  /** Dia de negócio (YYYY-MM-DD). */
  today: string;
  /** Agora (HH:mm, fuso de negócio). */
  nowTime: string;
  now: Date;
  digestTime: string;
  /** Só tarefas abertas. */
  tasks: TaskSnap[];
  objectives: ObjectiveSnap[];
  goals: GoalSnap[];
  habits: HabitSnap[];
  /** Só desafios ativos hoje. */
  challenges: ChallengeSnap[];
  /** Contas a pagar (saídas) ainda não pagas, vencidas ou vencendo em breve. */
  bills: BillSnap[];
  flashcardsDue: number;
  /** Números da semana — só preenchido no domingo. */
  week: { tasksDone: number; habitChecks: number } | null;
}

// Valores iniciais das regras (ver docs no topo).
export const RULES = {
  /** A partir de que horas lembra dos hábitos/desafios ainda não feitos. */
  eveningTime: '19:00',
  /** A partir de que horas avisa da tarefa prioritária que vence hoje. */
  dueTodayTime: '17:00',
  /** Domingo, a partir dessa hora, sai o resumo semanal. */
  weeklyReviewTime: '18:00',
  objectiveDueSoonDays: 3,
  objectiveStaleDays: 7,
  /** Conquistas ficam como "novas" por esse tempo. */
  celebrateDays: 3,
  billSoonDays: 2,
  goalNearRatio: 0.9,
  /** Push só fora do silêncio [quietStart, quietEnd). */
  quietStart: '22:00',
  quietEnd: '07:00',
} as const;

const DAY_MS = 86_400_000;

export function isQuietTime(nowTime: string): boolean {
  return nowTime >= RULES.quietStart || nowTime < RULES.quietEnd;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function listTitles(titles: string[], max = 3): string {
  const shown = titles.slice(0, max).join(', ');
  return titles.length > max ? `${shown} e mais ${titles.length - max}` : shown;
}

function money(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function overdueLabel(dueDate: string, today: string): string {
  const days = diffDays(dueDate, today);
  return days === 1 ? 'Venceu ontem' : `Venceu há ${days} dias`;
}

function daysLeftLabel(days: number): string {
  if (days === 0) return 'vence hoje';
  if (days === 1) return 'vence amanhã';
  return `vence em ${days} dias`;
}

function taskSignals(s: Snapshot): Signal[] {
  const out: Signal[] = [];
  const open = s.tasks.filter((t) => t.dueDate);
  const overdue = open.filter((t) => t.dueDate! < s.today);

  // Prioritárias atrasadas: urgente, uma notificação por tarefa.
  for (const t of overdue.filter((t) => t.priority === 'high')) {
    out.push({
      key: `task-overdue:${t.id}`,
      kind: 'task_overdue',
      severity: 'urgent',
      title: `Tarefa prioritária atrasada: ${t.title}`,
      body: `${overdueLabel(t.dueDate!, s.today)}. Conclua ou reagende para reorganizar seu dia.`,
      url: '/tarefas',
      entityId: t.id,
      push: true,
    });
  }

  // Demais atrasadas: UMA notificação agrupada (key estável), atualizada a cada ciclo.
  const rest = overdue.filter((t) => t.priority !== 'high');
  if (rest.length === 1) {
    const t = rest[0];
    out.push({
      key: 'tasks-overdue',
      kind: 'task_overdue',
      severity: 'important',
      title: `Tarefa atrasada: ${t.title}`,
      body: `${overdueLabel(t.dueDate!, s.today)}. Conclua ou reagende.`,
      url: '/tarefas',
      entityId: t.id,
      push: true,
    });
  } else if (rest.length > 1) {
    out.push({
      key: 'tasks-overdue',
      kind: 'task_overdue',
      severity: 'important',
      title: `Você tem ${rest.length} tarefas atrasadas`,
      body: `${listTitles(rest.map((t) => t.title))}. Revise suas pendências para reorganizar o dia.`,
      url: '/tarefas',
      entityId: null,
      push: true,
    });
  }

  const dueToday = open.filter((t) => t.dueDate === s.today);
  const urgentToday =
    s.nowTime >= RULES.dueTodayTime
      ? dueToday.filter((t) => t.priority === 'high')
      : [];
  for (const t of urgentToday) {
    out.push({
      key: `task-due-today:${t.id}:${s.today}`,
      kind: 'task_due_today',
      severity: 'important',
      title: `Vence hoje: ${t.title}`,
      body: 'Tarefa de alta prioridade ainda aberta. Ainda dá tempo!',
      url: '/tarefas',
      entityId: t.id,
      push: true,
    });
  }

  const calmToday = dueToday.filter((t) => !urgentToday.includes(t));
  if (calmToday.length > 0) {
    out.push({
      key: `tasks-today:${s.today}`,
      kind: 'tasks_today',
      severity: 'info',
      title:
        calmToday.length === 1
          ? `Para hoje: ${calmToday[0].title}`
          : `${calmToday.length} tarefas para hoje`,
      body:
        calmToday.length === 1
          ? 'Uma tarefa com prazo para hoje.'
          : listTitles(calmToday.map((t) => t.title)),
      url: '/tarefas',
      entityId: calmToday.length === 1 ? calmToday[0].id : null,
      push: false,
    });
  }
  return out;
}

function objectiveSignals(s: Snapshot): Signal[] {
  const out: Signal[] = [];
  for (const o of s.objectives) {
    if (o.completedAt) {
      if (
        s.now.getTime() - o.completedAt.getTime() <=
        RULES.celebrateDays * DAY_MS
      ) {
        out.push({
          key: `objective-done:${o.id}`,
          kind: 'objective_done',
          severity: 'info',
          title: `Parabéns! Meta concluída: ${o.title}`,
          body: 'Mais uma conquista na sua trajetória. Que tal registrar o próximo passo?',
          url: '/metas',
          entityId: o.id,
          push: false,
        });
      }
      continue;
    }

    if (o.deadline && o.deadline < s.today) {
      out.push({
        key: `objective-overdue:${o.id}`,
        kind: 'objective_overdue',
        severity: 'urgent',
        title: `Meta com prazo vencido: ${o.title}`,
        body: `Está em ${o.progress}%. Atualize o progresso ou revise o prazo.`,
        url: '/metas',
        entityId: o.id,
        push: true,
      });
      continue;
    }

    const daysLeft = o.deadline ? diffDays(s.today, o.deadline) : null;
    if (daysLeft !== null && daysLeft <= RULES.objectiveDueSoonDays) {
      out.push({
        key: `objective-due-soon:${o.id}`,
        kind: 'objective_due_soon',
        severity: 'important',
        title: `Meta perto do prazo: ${o.title}`,
        body: `A meta ${daysLeftLabel(daysLeft)} e está em ${o.progress}%.`,
        url: '/metas',
        entityId: o.id,
        push: true,
      });
      continue;
    }

    const idle = Math.floor(
      (s.now.getTime() - o.lastActivityAt.getTime()) / DAY_MS,
    );
    if (idle >= RULES.objectiveStaleDays) {
      out.push({
        key: `objective-stale:${o.id}`,
        kind: 'objective_stale',
        severity: 'important',
        title: `Sua meta "${o.title}" está parada`,
        body: `Nenhum progresso nos últimos ${idle} dias. Que tal reservar um horário hoje para a próxima etapa?`,
        url: '/metas',
        entityId: o.id,
        push: false,
      });
    }
  }
  return out;
}

function goalSignals(s: Snapshot): Signal[] {
  const out: Signal[] = [];
  const month = s.today.slice(0, 7);
  for (const g of s.goals) {
    if (g.completedAt) {
      if (
        s.now.getTime() - g.completedAt.getTime() <=
        RULES.celebrateDays * DAY_MS
      ) {
        out.push({
          key: `goal-done:${g.id}`,
          kind: 'goal_done',
          severity: 'info',
          title: `Objetivo alcançado: ${g.name}`,
          body: `Você guardou ${money(g.targetCents)}. Parabéns pela conquista!`,
          url: '/financas?tab=metas',
          entityId: g.id,
          push: false,
        });
      }
      continue;
    }
    if (g.deadline && g.deadline < month) {
      out.push({
        key: `goal-overdue:${g.id}`,
        kind: 'goal_overdue',
        severity: 'important',
        title: `Prazo da economia passou: ${g.name}`,
        body: `Faltam ${money(g.targetCents - g.savedCents)}. Revise o prazo ou o valor dos aportes.`,
        url: '/financas?tab=metas',
        entityId: g.id,
        push: false,
      });
      continue;
    }
    if (
      g.targetCents > 0 &&
      g.savedCents / g.targetCents >= RULES.goalNearRatio
    ) {
      out.push({
        key: `goal-near:${g.id}`,
        kind: 'goal_near',
        severity: 'info',
        title: `Você está perto do objetivo: ${g.name}`,
        body: `Faltam só ${money(g.targetCents - g.savedCents)}.`,
        url: '/financas?tab=metas',
        entityId: g.id,
        push: false,
      });
    }
  }
  return out;
}

function eveningSignals(s: Snapshot): Signal[] {
  if (s.nowTime < RULES.eveningTime) return [];
  const out: Signal[] = [];
  const weekday = weekdayOf(s.today);

  // Hábitos com horário ainda por vir têm o próprio lembrete — não antecipa.
  const pending = s.habits.filter(
    (h) =>
      !h.checkedToday &&
      h.weekdays.includes(weekday) &&
      (!h.reminderTime || h.reminderTime <= s.nowTime),
  );
  if (pending.length > 0) {
    out.push({
      key: `habits-pending:${s.today}`,
      kind: 'habit_pending',
      severity: 'important',
      title:
        pending.length === 1
          ? `Hábito pendente: ${pending[0].name}`
          : `${pending.length} hábitos ainda não realizados hoje`,
      body:
        pending.length === 1
          ? 'O dia está acabando — ainda dá para manter a sequência.'
          : `${listTitles(pending.map((h) => h.name))}. Ainda dá para manter a sequência.`,
      url: '/habitos',
      entityId: pending.length === 1 ? pending[0].id : null,
      push: true,
    });
  }

  for (const c of s.challenges.filter((c) => !c.checkedToday)) {
    out.push({
      key: `challenge-checkin:${c.id}:${s.today}`,
      kind: 'challenge_checkin',
      severity: 'important',
      title: `Check-in pendente: ${c.title}`,
      body: 'Faça o check-in de hoje para não quebrar o desafio.',
      url: '/desafios',
      entityId: c.id,
      push: true,
    });
  }
  return out;
}

function billSignals(s: Snapshot): Signal[] {
  const out: Signal[] = [];
  const soonLimit = addDays(s.today, RULES.billSoonDays);
  for (const b of s.bills) {
    const amount = money(b.amountCents);
    if (b.dueDate < s.today) {
      out.push({
        key: `bill-overdue:${b.id}:${b.dueDate}`,
        kind: 'bill_overdue',
        severity: 'urgent',
        title: `Conta atrasada: ${b.description}`,
        body: `${amount} · ${overdueLabel(b.dueDate, s.today)}. Pague ou registre o pagamento.`,
        url: '/financas?tab=recorrentes',
        entityId: b.id,
        push: true,
      });
    } else if (b.dueDate === s.today) {
      out.push({
        key: `bill-due:${b.id}:${b.dueDate}`,
        kind: 'bill_due',
        severity: 'important',
        title: `Conta vence hoje: ${b.description}`,
        body: `${amount}. Não esqueça de pagar.`,
        url: '/financas?tab=recorrentes',
        entityId: b.id,
        push: true,
      });
    } else if (b.dueDate <= soonLimit) {
      out.push({
        key: `bill-soon:${b.id}:${b.dueDate}`,
        kind: 'bill_soon',
        severity: 'info',
        title: `Conta ${daysLeftLabel(diffDays(s.today, b.dueDate))}: ${b.description}`,
        body: amount,
        url: '/financas?tab=recorrentes',
        entityId: b.id,
        push: false,
      });
    }
  }
  return out;
}

function studySignals(s: Snapshot): Signal[] {
  if (s.flashcardsDue <= 0) return [];
  return [
    {
      key: `flashcards-due:${s.today}`,
      kind: 'flashcards_due',
      severity: 'info',
      title: 'Hora de revisar seus estudos',
      body: `${plural(s.flashcardsDue, 'card esperando', 'cards esperando')} revisão no vocabulário.`,
      url: '/vocabulario',
      entityId: null,
      push: false,
    },
  ];
}

function weeklySignal(s: Snapshot): Signal[] {
  if (
    !s.week ||
    weekdayOf(s.today) !== 0 ||
    s.nowTime < RULES.weeklyReviewTime
  ) {
    return [];
  }
  return [
    {
      key: `weekly-review:${s.today}`,
      kind: 'weekly_review',
      severity: 'info',
      title: 'Seu resumo semanal está pronto',
      body: `Nesta semana: ${plural(s.week.tasksDone, 'tarefa concluída', 'tarefas concluídas')} e ${plural(s.week.habitChecks, 'check-in de hábito', 'check-ins de hábitos')}. Reserve uns minutos para planejar a próxima.`,
      url: '/tarefas',
      entityId: null,
      push: true,
    },
  ];
}

/** Resumo inteligente do dia (nível 4): um push só, com o que importa. */
function digestSignal(s: Snapshot, signals: Signal[]): Signal[] {
  if (s.nowTime < s.digestTime) return [];
  const overdue = s.tasks.filter(
    (t) => t.dueDate && t.dueDate < s.today,
  ).length;
  const today = s.tasks.filter((t) => t.dueDate === s.today).length;
  const weekday = weekdayOf(s.today);
  const habits = s.habits.filter(
    (h) => !h.checkedToday && h.weekdays.includes(weekday),
  ).length;
  const bills = s.bills.filter((b) => b.dueDate <= s.today).length;
  const stale = signals.filter((x) => x.kind === 'objective_stale').length;

  const parts = [
    overdue && plural(overdue, 'tarefa atrasada', 'tarefas atrasadas'),
    today && plural(today, 'tarefa para hoje', 'tarefas para hoje'),
    habits && plural(habits, 'hábito no dia', 'hábitos no dia'),
    bills && plural(bills, 'conta a pagar', 'contas a pagar'),
    stale && plural(stale, 'meta parada', 'metas paradas'),
    s.flashcardsDue &&
      plural(s.flashcardsDue, 'card para revisar', 'cards para revisar'),
  ].filter((p): p is string => Boolean(p));
  if (parts.length === 0) return [];

  return [
    {
      key: `digest:${s.today}`,
      kind: 'daily_digest',
      severity: 'info',
      title: 'Seu dia em órbita',
      body: `${parts.join(' · ')}.`,
      url: '/notificacoes',
      entityId: null,
      push: true,
    },
  ];
}

export function buildSignals(s: Snapshot): Signal[] {
  const signals = [
    ...taskSignals(s),
    ...objectiveSignals(s),
    ...goalSignals(s),
    ...eveningSignals(s),
    ...billSignals(s),
    ...studySignals(s),
    ...weeklySignal(s),
  ];
  return [...signals, ...digestSignal(s, signals)];
}

/**
 * Agrupa os pushes pendentes de um ciclo: um só vira o próprio aviso; vários
 * viram um alerta único ("Você tem 3 alertas") — nunca uma rajada.
 */
export function groupPush(
  pending: {
    key: string;
    title: string;
    body: string;
    url: string | null;
    severity: Severity;
  }[],
): { title: string; body: string; url: string; tag: string } | null {
  if (pending.length === 0) return null;
  if (pending.length === 1) {
    const [n] = pending;
    return {
      title: n.title,
      body: n.body,
      url: n.url ?? '/notificacoes',
      tag: `notif-${n.key}`,
    };
  }
  const urgent = pending.filter((n) => n.severity === 'urgent').length;
  return {
    title: urgent
      ? `${plural(pending.length, 'alerta', 'alertas')} · ${urgent} urgente${urgent > 1 ? 's' : ''}`
      : `Você tem ${plural(pending.length, 'alerta novo', 'alertas novos')}`,
    body: listTitles(
      pending.map((n) => n.title),
      2,
    ),
    url: '/notificacoes',
    tag: 'notif-group',
  };
}
