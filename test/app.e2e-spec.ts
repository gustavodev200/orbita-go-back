import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CATEGORY_KEYS } from '../src/categories/categories';
import {
  businessDay,
  businessTime,
  weekdayOf,
} from '../src/common/time/business-time';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  deleteTestUser,
  loginAs,
  makeTestIdentity,
  registerTestUser,
} from './utils/test-app';

/**
 * Full walkthrough of órbitaGO's backend against the REAL database (see
 * test/utils/test-app.ts): only SupabaseJwtGuard is swapped for a fake that
 * attaches a fixed identity, everything else (Prisma, business logic,
 * validation, exception mapping) runs exactly as in production.
 *
 * Two throwaway users are used: `A` (the main walkthrough) and `B` (only to
 * prove cross-user isolation). Both are deleted in `afterAll`
 * (cascades to every owned row per schema.prisma) and a final query confirms
 * no `e2e-test-` rows are left over.
 */

const REWARD_KEYS = ['xp', 'coins', 'leveledUp', 'achievements', 'me'].sort();
const ACHIEVEMENT_KEYS = ['key', 'title', 'description', 'icon'].sort();
const ME_KEYS = [
  'id',
  'email',
  'name',
  'avatarUrl',
  'onboarded',
  'level',
  'xp',
  'xpToNext',
  'coins',
  'streak',
  'streakRecord',
  'shields',
  'theme',
  'monthlyIncomeCents',
  'ownedItems',
  'enabledCategoryKeys',
  'notificationsEnabled',
].sort();

function keysOf(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

function expectMeShape(me: Record<string, unknown>): void {
  expect(keysOf(me)).toEqual(ME_KEYS);
}

function expectRewardShape(reward: Record<string, unknown>): void {
  expect(keysOf(reward)).toEqual(REWARD_KEYS);
  expectMeShape(reward.me as Record<string, unknown>);
  for (const achievement of reward.achievements as Record<string, unknown>[]) {
    expect(keysOf(achievement)).toEqual(ACHIEVEMENT_KEYS);
  }
}

describe('órbitaGO e2e walkthrough', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  const userA = makeTestIdentity('main');
  const userB = makeTestIdentity('other');
  const userC = makeTestIdentity('shield');

  const today = businessDay();
  const month = today.slice(0, 7);

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    http = request(app.getHttpServer());

    await registerTestUser(app, userA);
    await registerTestUser(app, userB);
    await registerTestUser(app, userC);
    loginAs(userA);
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(prisma, userA.id);
    await deleteTestUser(prisma, userB.id);
    await deleteTestUser(prisma, userC.id);

    const leftover = await prisma.db.user.findMany({
      where: { email: { startsWith: 'e2e-test-' } },
      select: { id: true, email: true },
    });
    expect(leftover).toEqual([]);

    await app.close();
  }, 30000);

  // ---------------------------------------------------------------------
  // Onboarding
  // ---------------------------------------------------------------------
  describe('onboarding', () => {
    let onboardingGoalId: string;

    it('creates user state, awards +50 XP, unlocks primeiro-passo, seeds accounts', async () => {
      const res = await http
        .post('/onboarding')
        .send({
          name: 'Fulano E2E',
          monthlyIncomeCents: 500000,
          categoryKeys: CATEGORY_KEYS.filter((k) => k !== 'edu' && k !== 'pet'),
          goal: { name: 'Viagem', targetCents: 100000, icon: 'savings' },
        })
        .expect(200);

      expect(keysOf(res.body)).toEqual(['data', 'reward'].sort());
      expectMeShape(res.body.data);
      expect(res.body.data.onboarded).toBe(true);
      expect(res.body.data.name).toBe('Fulano E2E');
      expect(res.body.reward).not.toBeNull();
      expectRewardShape(res.body.reward);
      expect(res.body.reward.xp).toBe(50);
      expect(res.body.reward.coins).toBe(0);
      expect(res.body.reward.leveledUp).toBe(false);
      expect(
        res.body.reward.achievements.map((a: { key: string }) => a.key),
      ).toContain('primeiro-passo');
      expect(res.body.reward.me.xp).toBe(50);

      const accounts = await prisma.db.account.findMany({
        where: { userId: userA.id },
      });
      expect(accounts).toHaveLength(3);
      expect(accounts.map((a) => a.name).sort()).toEqual(
        ['Carteira', 'Itaú', 'Nubank'].sort(),
      );

      const goals = await prisma.db.goal.findMany({
        where: { userId: userA.id },
      });
      expect(goals).toHaveLength(1);
      onboardingGoalId = goals[0].id;
      expect(goals[0].targetCents).toBe(100000);
    });

    it('is idempotent: repeating onboarding updates data but pays no reward again', async () => {
      const res = await http
        .post('/onboarding')
        .send({
          name: 'Fulano E2E',
          categoryKeys: ['ali', 'mer'],
        })
        .expect(200);

      expect(res.body.reward).toBeNull();
      expectMeShape(res.body.data);
      expect(res.body.data.enabledCategoryKeys.sort()).toEqual(['ali', 'mer']);

      // a 2nd onboarding call must not create a 2nd goal
      const goals = await prisma.db.goal.findMany({
        where: { userId: userA.id },
      });
      expect(goals).toHaveLength(1);
      expect(goals[0].id).toBe(onboardingGoalId);
    });

    it('re-enables all categories used by later tests', async () => {
      await http
        .patch('/me')
        .send({ enabledCategoryKeys: CATEGORY_KEYS })
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------
  // /me
  // ---------------------------------------------------------------------
  describe('/me', () => {
    it('GET returns unwrapped Me', async () => {
      const res = await http.get('/me').expect(200);
      expectMeShape(res.body);
      expect(res.body.name).toBe('Fulano E2E');
    });

    it('PATCH updates fields and returns unwrapped Me (no envelope)', async () => {
      const res = await http
        .patch('/me')
        .send({ name: 'Fulano Atualizado', theme: 'dark' })
        .expect(200);
      expectMeShape(res.body);
      expect(res.body).not.toHaveProperty('data');
      expect(res.body).not.toHaveProperty('reward');
      expect(res.body.name).toBe('Fulano Atualizado');
      expect(res.body.theme).toBe('dark');
    });

    it('rejects unknown fields (zod .strict())', async () => {
      await http.patch('/me').send({ notAField: 1 }).expect(400);
    });
  });

  // ---------------------------------------------------------------------
  // categories / accounts
  // ---------------------------------------------------------------------
  let accountId: string;

  describe('categories & accounts', () => {
    it('GET /categories returns the fixed catalog', async () => {
      const res = await http.get('/categories').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(CATEGORY_KEYS.length);
      const ali = res.body.find((c: { key: string }) => c.key === 'ali');
      expect(ali).toMatchObject({
        key: 'ali',
        name: 'Alimentação',
        type: 'expense',
      });
      expect(typeof ali.color).toBe('string');
    });

    it('GET /accounts returns the 3 seeded accounts with color', async () => {
      const res = await http.get('/accounts').expect(200);
      expect(res.body).toHaveLength(3);
      for (const account of res.body) {
        expect(keysOf(account)).toEqual(['id', 'name', 'icon', 'color'].sort());
        expect(typeof account.color).toBe('string');
      }
      accountId = res.body[0].id;
    });
  });

  // ---------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------
  const TX_KEYS = [
    'id',
    'type',
    'amountCents',
    'description',
    'categoryKey',
    'date',
    'accountId',
    'recurringId',
    'createdAt',
  ].sort();

  let keptExpenseTxId: string;
  let keptIncomeTxId: string;

  describe('transactions', () => {
    it('create/patch/delete lifecycle + reward envelope', async () => {
      const createRes = await http
        .post('/transactions')
        .send({
          type: 'expense',
          amountCents: 1234,
          description: 'Lançamento temporário',
          categoryKey: 'out',
          date: today,
          accountId,
        })
        .expect(201);

      expect(keysOf(createRes.body)).toEqual(['data', 'reward'].sort());
      expect(keysOf(createRes.body.data)).toEqual(TX_KEYS);
      expect(createRes.body.data.recurringId).toBeNull();
      expectRewardShape(createRes.body.reward);
      expect(createRes.body.reward.xp).toBe(10);
      expect(createRes.body.reward.coins).toBe(2);

      const id = createRes.body.data.id;

      const patchRes = await http
        .patch(`/transactions/${id}`)
        .send({ amountCents: 4321 })
        .expect(200);
      expect(keysOf(patchRes.body)).toEqual(TX_KEYS);
      expect(patchRes.body.amountCents).toBe(4321);
      expect(patchRes.body).not.toHaveProperty('reward');

      await http.delete(`/transactions/${id}`).expect(200).expect({ ok: true });
      await http
        .patch(`/transactions/${id}`)
        .send({ amountCents: 1 })
        .expect(404);
      await http.delete(`/transactions/${id}`).expect(404);
    });

    it('creates the expense + income transactions used by later sections', async () => {
      const expenseRes = await http
        .post('/transactions')
        .send({
          type: 'expense',
          amountCents: 5000,
          description: 'Almoço',
          categoryKey: 'ali',
          date: today,
          accountId,
        })
        .expect(201);
      keptExpenseTxId = expenseRes.body.data.id;
      expect(expenseRes.body.reward.xp).toBe(10);

      const incomeRes = await http
        .post('/transactions')
        .send({
          type: 'income',
          amountCents: 300000,
          description: 'Salário',
          categoryKey: 'sal',
          date: today,
          accountId,
        })
        .expect(201);
      keptIncomeTxId = incomeRes.body.data.id;
      expect(incomeRes.body.reward.xp).toBe(10);
    });

    it('rejects a category/type mismatch', async () => {
      await http
        .post('/transactions')
        .send({
          type: 'expense',
          amountCents: 100,
          description: 'x',
          categoryKey: 'sal', // income-only category
          date: today,
          accountId,
        })
        .expect(400);
    });

    it('GET /transactions lists this month, newest first', async () => {
      const res = await http.get(`/transactions?month=${month}`).expect(200);
      const ids = res.body.map((t: { id: string }) => t.id);
      expect(ids).toEqual(
        expect.arrayContaining([keptExpenseTxId, keptIncomeTxId]),
      );
    });

    it('GET /transactions/summary aggregates income/expense/daily', async () => {
      const res = await http
        .get(`/transactions/summary?month=${month}`)
        .expect(200);
      expect(keysOf(res.body)).toEqual(
        ['balanceCents', 'incomeCents', 'expenseCents', 'daily'].sort(),
      );
      expect(res.body.incomeCents).toBeGreaterThanOrEqual(300000);
      expect(res.body.expenseCents).toBeGreaterThanOrEqual(5000);
      expect(Array.isArray(res.body.daily)).toBe(true);
    });

    it('POST /transactions/parse understands varied Portuguese sentences', async () => {
      const cases: [string, { type: string; categoryKey?: string }][] = [
        ['Gastei 45,90 no ifood hoje', { type: 'expense', categoryKey: 'ali' }],
        ['Recebi 1200 de salário', { type: 'income', categoryKey: 'sal' }],
        [
          'Paguei 89 de internet ontem',
          { type: 'expense', categoryKey: 'cas' },
        ],
        ['Uber até o trabalho 23,50', { type: 'expense', categoryKey: 'tra' }],
      ];
      for (const [text, expected] of cases) {
        const res = await http
          .post('/transactions/parse')
          .send({ text })
          .expect(200);
        expect(keysOf(res.body)).toEqual(
          ['type', 'amountCents', 'description', 'categoryKey', 'date'].sort(),
        );
        expect(res.body.type).toBe(expected.type);
        expect(res.body.categoryKey).toBe(expected.categoryKey);
        expect(res.body.amountCents).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------
  // Recurrings + Boss (boss rides on the same "aluguel" recurring)
  // ---------------------------------------------------------------------
  let recurringId: string;
  const dueDay = Number(today.slice(8, 10)); // today's day-of-month: only value
  // guaranteed to produce an occurrence >= startDate(=today) this month.

  describe('recurrings', () => {
    it('GET /boss is null before any expense recurring exists', async () => {
      const res = await http.get('/boss').expect(200);
      expect(res.body).toBeNull();
    });

    it('creates a monthly recurring', async () => {
      const res = await http
        .post('/recurrings')
        .send({
          description: 'Aluguel',
          amountCents: 150000,
          categoryKey: 'cas',
          type: 'expense',
          frequency: 'monthly',
          dueDay,
          accountId,
        })
        .expect(201);
      recurringId = res.body.id;
      expect(res.body.status).toBe('pending');
      expect(res.body.dueDate).toBe(today);
    });

    it('GET /recurrings/upcoming includes it', async () => {
      const res = await http.get('/recurrings/upcoming?days=7').expect(200);
      expect(res.body.map((r: { id: string }) => r.id)).toContain(recurringId);
    });

    it('POST /recurrings/:id/pay awards +10 XP and creates a Transaction', async () => {
      const before = await prisma.db.transaction.count({
        where: { userId: userA.id },
      });
      const res = await http.post(`/recurrings/${recurringId}/pay`).expect(200);
      expect(res.body.reward.xp).toBe(10);
      expect(res.body.data.status).toBe('paid');
      const after = await prisma.db.transaction.count({
        where: { userId: userA.id },
      });
      expect(after).toBe(before + 1);
    });

    it('does not double-pay the same period', async () => {
      await http.post(`/recurrings/${recurringId}/pay`).expect(409);
    });

    it('GET /recurrings reflects paid status for the month', async () => {
      const res = await http.get(`/recurrings?month=${month}`).expect(200);
      const row = res.body.find((r: { id: string }) => r.id === recurringId);
      expect(row.status).toBe('paid');
      expect(row.paidAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Budgets
  // ---------------------------------------------------------------------
  describe('budgets', () => {
    it('PUT replaces the set, GET reflects real spentCents', async () => {
      const putRes = await http
        .put('/budgets')
        .send({
          items: [
            { categoryKey: 'ali', limitCents: 10000 },
            { categoryKey: 'cas', limitCents: 200000 },
          ],
        })
        .expect(200);
      expect(Array.isArray(putRes.body)).toBe(true);

      const getRes = await http.get(`/budgets?month=${month}`).expect(200);
      const ali = getRes.body.find(
        (b: { categoryKey: string }) => b.categoryKey === 'ali',
      );
      const cas = getRes.body.find(
        (b: { categoryKey: string }) => b.categoryKey === 'cas',
      );
      expect(ali.spentCents).toBeGreaterThanOrEqual(5000);
      expect(cas.spentCents).toBeGreaterThanOrEqual(150000);
    });

    it('rejects budgets for income categories', async () => {
      await http
        .put('/budgets')
        .send({ items: [{ categoryKey: 'sal', limitCents: 1000 }] })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------
  // Goals: chests at steps 3 & 7, completion + achievement
  // ---------------------------------------------------------------------
  let goalId: string;

  const GOAL_KEYS = [
    'id',
    'name',
    'icon',
    'targetCents',
    'savedCents',
    'installmentCents',
    'steps',
    'currentStep',
    'chestsOpened',
    'completed',
    'deadline',
  ].sort();

  describe('goals', () => {
    it('finds the onboarding goal', async () => {
      const res = await http.get('/goals').expect(200);
      expect(res.body).toHaveLength(1);
      goalId = res.body[0].id;
      expect(keysOf(res.body[0])).toEqual(GOAL_KEYS);
      expect(res.body[0].steps).toBe(10);
      expect(res.body[0].chestsOpened).toEqual([]);
      expect(res.body[0].installmentCents).toBeNull();
    });

    it('rejects an installmentCents greater than targetCents', async () => {
      await http
        .patch(`/goals/${goalId}`)
        .send({ installmentCents: 999999999 })
        .expect(400);
    });

    it('accepts a valid installmentCents', async () => {
      const res = await http
        .patch(`/goals/${goalId}`)
        .send({ installmentCents: 10000 })
        .expect(200);
      expect(res.body.installmentCents).toBe(10000);
    });

    it('deposit crossing step 3 opens exactly one chest (+50 coins)', async () => {
      const res = await http
        .post(`/goals/${goalId}/deposit`)
        .send({ amountCents: 30000 })
        .expect(200);
      expect(res.body.data.currentStep).toBe(3);
      expect(res.body.data.chestsOpened).toEqual([3]);
      expect(res.body.reward.xp).toBe(20);
      expect(res.body.reward.coins).toBe(50);
      expect(
        res.body.reward.achievements.map((a: { key: string }) => a.key),
      ).toContain('cofrinho');
    });

    it('deposit within the same bracket opens no new chest', async () => {
      const res = await http
        .post(`/goals/${goalId}/deposit`)
        .send({ amountCents: 10000 })
        .expect(200);
      expect(res.body.data.currentStep).toBe(4);
      expect(res.body.data.chestsOpened).toEqual([3]);
      expect(res.body.reward.coins).toBe(0);
    });

    it('deposit crossing step 7 opens the 2nd chest exactly once', async () => {
      const res = await http
        .post(`/goals/${goalId}/deposit`)
        .send({ amountCents: 30000 })
        .expect(200);
      expect(res.body.data.currentStep).toBe(7);
      expect(res.body.data.chestsOpened.sort()).toEqual([3, 7]);
      expect(res.body.reward.coins).toBe(50);
    });

    it('final deposit completes the goal and unlocks zerou-a-trilha', async () => {
      const res = await http
        .post(`/goals/${goalId}/deposit`)
        .send({ amountCents: 30000 })
        .expect(200);
      expect(res.body.data.completed).toBe(true);
      expect(
        res.body.reward.achievements.map((a: { key: string }) => a.key),
      ).toContain('zerou-a-trilha');
    });

    it('depositing on a completed goal is rejected (409)', async () => {
      await http
        .post(`/goals/${goalId}/deposit`)
        .send({ amountCents: 100 })
        .expect(409);
    });
  });

  // ---------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------
  let taskAId: string;
  let taskBId: string;

  describe('tasks', () => {
    it('creates and completes task A (+5 XP), uncomplete, re-complete pays no XP again', async () => {
      const createRes = await http
        .post('/tasks')
        .send({ title: 'Tarefa A', priority: 'medium' })
        .expect(201);
      taskAId = createRes.body.id;

      const completeRes = await http
        .post(`/tasks/${taskAId}/complete`)
        .expect(200);
      expect(completeRes.body.reward.xp).toBe(5);
      expect(completeRes.body.data.done).toBe(true);

      const uncompleteRes = await http
        .post(`/tasks/${taskAId}/uncomplete`)
        .expect(200);
      expect(uncompleteRes.body.done).toBe(false);
      expect(uncompleteRes.body).not.toHaveProperty('reward');

      const recompleteRes = await http
        .post(`/tasks/${taskAId}/complete`)
        .expect(200);
      expect(recompleteRes.body.reward).toBeNull();
      expect(recompleteRes.body.data.done).toBe(true);
    });

    it('creates and completes task B (for the concluir-tarefas mission)', async () => {
      const createRes = await http
        .post('/tasks')
        .send({ title: 'Tarefa B', priority: 'high' })
        .expect(201);
      taskBId = createRes.body.id;
      await http.post(`/tasks/${taskBId}/complete`).expect(200);
    });

    it('deletes a throwaway task', async () => {
      const createRes = await http
        .post('/tasks')
        .send({ title: 'Tarefa descartável', priority: 'low' })
        .expect(201);
      const res = await http.delete(`/tasks/${createRes.body.id}`).expect(200);
      expect(res.body.id).toBe(createRes.body.id);
      await http.delete(`/tasks/${createRes.body.id}`).expect(404);
    });
  });

  // ---------------------------------------------------------------------
  // Reminders
  // ---------------------------------------------------------------------
  let reminderNoneId: string;

  describe('reminders', () => {
    it('creates one of each repeat kind', async () => {
      const none = await http
        .post('/reminders')
        .send({
          title: 'Pagar boleto',
          kind: 'finance',
          time: '03:11',
          repeat: 'none',
          date: today,
        })
        .expect(201);
      reminderNoneId = none.body.id;

      await http
        .post('/reminders')
        .send({
          title: 'Beber água',
          kind: 'task',
          time: '03:22',
          repeat: 'daily',
        })
        .expect(201);

      await http
        .post('/reminders')
        .send({
          title: 'Revisar orçamento',
          kind: 'finance',
          time: '03:33',
          repeat: 'weekly',
          weekday: weekdayOf(today),
        })
        .expect(201);

      await http
        .post('/reminders')
        .send({
          title: 'Pagar aluguel',
          kind: 'finance',
          time: '03:44',
          repeat: 'monthly',
          dayOfMonth: dueDay,
        })
        .expect(201);
    });

    it('POST /reminders/parse understands varied sentences', async () => {
      const cases = [
        'me lembra de pagar o aluguel todo dia 5 às 9h',
        'lembrete de beber água amanhã',
        'me lembra de estudar toda segunda às 19h',
      ];
      for (const text of cases) {
        const res = await http
          .post('/reminders/parse')
          .send({ text })
          .expect(200);
        expect(keysOf(res.body)).toEqual(
          expect.arrayContaining(['title', 'kind', 'time', 'repeat']),
        );
        expect(typeof res.body.title).toBe('string');
      }
    });

    it('deletes the one-time reminder', async () => {
      await http.delete(`/reminders/${reminderNoneId}`).expect(200);
      await http.delete(`/reminders/${reminderNoneId}`).expect(404);
    });
  });

  // ---------------------------------------------------------------------
  // Missions
  // ---------------------------------------------------------------------
  describe('missions', () => {
    it('GET /missions/today reflects real progress', async () => {
      const res = await http.get('/missions/today').expect(200);
      expect(res.body).toHaveLength(3);
      const byKey = Object.fromEntries(
        res.body.map((m: { key: string; progress: number }) => [m.key, m]),
      );
      expect(byKey['registrar-lancamentos'].progress).toBeGreaterThanOrEqual(3);
      expect(byKey['concluir-tarefas'].progress).toBeGreaterThanOrEqual(2);
      expect(byKey['gastar-pouco'].unit).toBe('cents');
    });

    it('claiming an incomplete mission is rejected', async () => {
      await http.post('/missions/gastar-pouco/claim').expect(400);
    });

    it('claims registrar-lancamentos, then rejects a double-claim', async () => {
      const res = await http
        .post('/missions/registrar-lancamentos/claim')
        .expect(200);
      expect(res.body.reward.xp).toBe(20);
      expect(res.body.reward.coins).toBe(5);
      await http.post('/missions/registrar-lancamentos/claim').expect(409);
    });

    it('claims concluir-tarefas', async () => {
      const res = await http
        .post('/missions/concluir-tarefas/claim')
        .expect(200);
      expect(res.body.reward.xp).toBe(15);
    });

    it('404s for an unknown mission key', async () => {
      await http.post('/missions/inexistente/claim').expect(404);
    });
  });

  // ---------------------------------------------------------------------
  // Streak
  // ---------------------------------------------------------------------
  describe('streak', () => {
    it('close-day awards +15 XP, +1 streak, closedToday true', async () => {
      const res = await http.post('/streak/close-day').expect(200);
      expect(res.body.reward.xp).toBe(15);
      expect(res.body.data.streak).toBe(1);
      expect(res.body.data.closedToday).toBe(true);
    });

    it('cannot close the same day twice', async () => {
      await http.post('/streak/close-day').expect(409);
    });

    it('GET /streak shape', async () => {
      const res = await http.get('/streak').expect(200);
      expect(keysOf(res.body)).toEqual(
        [
          'streak',
          'record',
          'shields',
          'days',
          'closedToday',
          'lostStreak',
        ].sort(),
      );
      expect(res.body.days).toHaveLength(7);
    });

    it('shield rejects when the streak is not at risk', async () => {
      await http.post('/streak/shield').expect(400);
    });

    it('shield rejects when the streak is already unrecoverable (gap > 2)', async () => {
      await prisma.db.user.update({
        where: { id: userA.id },
        data: { lastClosedDay: dayMinus(today, 3) },
      });
      await http.post('/streak/shield').expect(400);
    });

    it('shield pays with coins when no shield item is owned', async () => {
      await prisma.db.user.update({
        where: { id: userA.id },
        data: { lastClosedDay: dayMinus(today, 2), coins: 500, shields: 0 },
      });
      const res = await http.post('/streak/shield').expect(200);
      expectMeShape(res.body);
      expect(res.body.coins).toBe(300);
      expect(res.body.shields).toBe(0);
    });

    it('re-protecting the same already-shielded day is rejected, not a 500', async () => {
      // Regression test for a real race-condition bug found by this suite:
      // the shield mechanic always protects exactly "yesterday" (a single,
      // fixed calendar day), so re-creating the gap=2 condition for user A
      // (who already shielded that same day above) used to hit the
      // (userId, day) unique constraint on StreakDay and surface as an
      // unhandled 500 — see streak.service.ts useShield(), now mapped to 409.
      await prisma.db.user.update({
        where: { id: userA.id },
        data: { lastClosedDay: dayMinus(today, 2), coins: 500, shields: 1 },
      });
      await http.post('/streak/shield').expect(409);
    });

    it('shield consumes a shield item when one is owned (separate user: the mechanic only ever protects "yesterday", so a 2nd shield for the same user/day always collides)', async () => {
      await prisma.db.user.update({
        where: { id: userC.id },
        data: {
          lastClosedDay: dayMinus(today, 2),
          streak: 3,
          coins: 0,
          shields: 1,
        },
      });
      loginAs(userC);
      const res = await http.post('/streak/shield').expect(200);
      loginAs(userA);
      expect(res.body.coins).toBe(0);
      expect(res.body.shields).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // Boss
  // ---------------------------------------------------------------------
  describe('boss', () => {
    it('GET /boss now returns the aluguel recurring as the boss', async () => {
      const res = await http.get('/boss').expect(200);
      expect(res.body).not.toBeNull();
      expect(res.body.maxHpCents).toBe(150000);
      expect(res.body.hpCents).toBe(150000);
      expect(res.body.defeated).toBe(false);
      expect(res.body.dueDate).toBe(today);
    });

    it('attack deals damage and awards XP', async () => {
      const res = await http
        .post('/boss/attack')
        .send({ amountCents: 100000 })
        .expect(200);
      expect(res.body.reward.xp).toBe(10);
      expect(res.body.data.hpCents).toBe(50000);
      expect(res.body.data.defeated).toBe(false);
    });

    it('a defeating attack unlocks cacador-de-chefao and never goes negative', async () => {
      const res = await http
        .post('/boss/attack')
        .send({ amountCents: 100000 })
        .expect(200);
      expect(res.body.data.hpCents).toBe(0);
      expect(res.body.data.defeated).toBe(true);
      expect(
        res.body.reward.achievements.map((a: { key: string }) => a.key),
      ).toContain('cacador-de-chefao');
    });

    it('attacking an already-defeated boss is rejected, HP stays at 0', async () => {
      await http.post('/boss/attack').send({ amountCents: 50000 }).expect(409);
      const res = await http.get('/boss').expect(200);
      expect(res.body.hpCents).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // Achievements
  // ---------------------------------------------------------------------
  describe('achievements', () => {
    it('GET /achievements has 12 entries with correct unlocked flags', async () => {
      const res = await http.get('/achievements').expect(200);
      expect(res.body).toHaveLength(12);
      const byKey = Object.fromEntries(
        res.body.map((a: { key: string; unlocked: boolean }) => [
          a.key,
          a.unlocked,
        ]),
      );
      expect(byKey['primeiro-passo']).toBe(true);
      expect(byKey['cofrinho']).toBe(true);
      expect(byKey['zerou-a-trilha']).toBe(true);
      expect(byKey['cacador-de-chefao']).toBe(true);
      expect(byKey['fogo-eterno']).toBe(false);
      expect(byKey['lenda']).toBe(false);
      for (const a of res.body) {
        expect(keysOf(a)).toEqual(
          [
            'key',
            'title',
            'description',
            'icon',
            'hint',
            'unlocked',
            'unlockedAt',
          ].sort(),
        );
      }
    });
  });

  // ---------------------------------------------------------------------
  // Shop
  // ---------------------------------------------------------------------
  describe('shop', () => {
    it('GET /shop lists the 4 catalog items', async () => {
      const res = await http.get('/shop').expect(200);
      expect(res.body).toHaveLength(4);
      expect(res.body.map((i: { key: string }) => i.key).sort()).toEqual(
        [
          'escudo',
          'tema-noite-estrelada',
          'cobre-festa',
          'cobre-soneca',
        ].sort(),
      );
    });

    it('buying with insufficient coins is rejected', async () => {
      await prisma.db.user.update({
        where: { id: userA.id },
        data: { coins: 50 },
      });
      await http.post('/shop/escudo/buy').expect(400);
    });

    it('buying a consumable deducts coins and can be bought again', async () => {
      await prisma.db.user.update({
        where: { id: userA.id },
        data: { coins: 1000 },
      });
      const res1 = await http.post('/shop/escudo/buy').expect(200);
      expect(res1.body.coins).toBe(800);
      expect(res1.body.shields).toBeGreaterThanOrEqual(1);

      const res2 = await http.post('/shop/escudo/buy').expect(200);
      expect(res2.body.coins).toBe(600);
    });

    it('buying a non-consumable adds to ownedItems; buying again is rejected', async () => {
      const res = await http.post('/shop/tema-noite-estrelada/buy').expect(200);
      expect(res.body.coins).toBe(100);
      expect(res.body.ownedItems).toContain('tema-noite-estrelada');

      await http.post('/shop/tema-noite-estrelada/buy').expect(409);
    });

    it('404s for an unknown item key', async () => {
      await http.post('/shop/inexistente/buy').expect(404);
    });
  });

  // ---------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------
  describe('stats', () => {
    it('GET /stats/compare shape', async () => {
      const res = await http.get('/stats/compare').expect(200);
      expect(keysOf(res.body)).toEqual(['previous', 'current'].sort());
      for (const period of [res.body.previous, res.body.current]) {
        expect(keysOf(period)).toEqual(
          ['month', 'byCategory', 'totalCents'].sort(),
        );
      }
      expect(res.body.current.totalCents).toBeGreaterThanOrEqual(150000);
    });
  });

  // ---------------------------------------------------------------------
  // Push
  // ---------------------------------------------------------------------
  const pushEndpoint = `https://push.example.invalid/ep-${userA.id}`;

  describe('push', () => {
    it('subscribe then re-subscribe to the same endpoint upserts (no duplicate row)', async () => {
      await http
        .post('/push/subscribe')
        .send({ endpoint: pushEndpoint, keys: { p256dh: 'p1', auth: 'a1' } })
        .expect(201, { ok: true });

      await http
        .post('/push/subscribe')
        .send({ endpoint: pushEndpoint, keys: { p256dh: 'p2', auth: 'a2' } })
        .expect(201, { ok: true });

      const rows = await prisma.db.pushSubscription.findMany({
        where: { endpoint: pushEndpoint },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].p256dh).toBe('p2');
      expect(rows[0].userId).toBe(userA.id);
    });

    it('DELETE removes the subscription', async () => {
      await http.delete('/push/subscribe').send({ endpoint: pushEndpoint });
      const rows = await prisma.db.pushSubscription.findMany({
        where: { endpoint: pushEndpoint },
      });
      expect(rows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // internal/dispatch-reminders
  // ---------------------------------------------------------------------
  describe('internal/dispatch-reminders', () => {
    const cronSecret = process.env.CRON_SECRET as string;
    let liveReminderId: string;
    const livePushEndpoint = `https://push.example.invalid/dispatch-${userA.id}`;

    beforeAll(() => {
      expect(cronSecret).toBeTruthy();
    });

    it('rejects a missing or wrong X-Cron-Secret', async () => {
      await http.post('/internal/dispatch-reminders').expect(401);
      await http
        .post('/internal/dispatch-reminders')
        .set('X-Cron-Secret', 'wrong-secret')
        .expect(401);
    });

    it('dispatches a due reminder and marks lastFiredAt without crashing', async () => {
      const nowTime = businessTime();

      const reminderRes = await http
        .post('/reminders')
        .send({
          title: 'Lembrete de dispatch',
          kind: 'task',
          time: nowTime,
          repeat: 'daily',
        })
        .expect(201);
      liveReminderId = reminderRes.body.id;

      await http.post('/push/subscribe').send({
        endpoint: livePushEndpoint,
        keys: { p256dh: 'p256dh-fake', auth: 'auth-fake' },
      });

      const res = await http
        .post('/internal/dispatch-reminders')
        .set('X-Cron-Secret', cronSecret)
        .expect(200);
      expect(typeof res.body.dispatched).toBe('number');

      const reminder = await prisma.db.reminder.findUniqueOrThrow({
        where: { id: liveReminderId },
      });
      expect(reminder.lastFiredAt).not.toBeNull();
    });

    it('does not double-fire our reminder on an immediate 2nd call', async () => {
      const before = await prisma.db.reminder.findUniqueOrThrow({
        where: { id: liveReminderId },
      });
      await http
        .post('/internal/dispatch-reminders')
        .set('X-Cron-Secret', cronSecret)
        .expect(200);
      const after = await prisma.db.reminder.findUniqueOrThrow({
        where: { id: liveReminderId },
      });
      expect(after.lastFiredAt?.getTime()).toBe(before.lastFiredAt?.getTime());
    });
  });

  // ---------------------------------------------------------------------
  // Level-up (real award path; XP seeded close to the threshold to avoid
  // ~130 sequential real requests just to cross 1500 — the crossing action
  // itself is a genuine POST /transactions award, exercising the exact same
  // applyXp() code a naturally-earned crossing would).
  // ---------------------------------------------------------------------
  describe('level up', () => {
    it('crossing 1500 XP levels up exactly once and carries the excess', async () => {
      const before = await prisma.db.user.findUniqueOrThrow({
        where: { id: userA.id },
      });
      await prisma.db.user.update({
        where: { id: userA.id },
        data: { xp: 1495, level: before.level },
      });

      const res = await http
        .post('/transactions')
        .send({
          type: 'expense',
          amountCents: 100,
          description: 'Ultimo lancamento',
          categoryKey: 'out',
          date: today,
          accountId,
        })
        .expect(201);

      expect(res.body.reward.leveledUp).toBe(true);
      expect(res.body.reward.me.level).toBe(before.level + 1);
      expect(res.body.reward.me.xp).toBe(5);
    });
  });

  // ---------------------------------------------------------------------
  // Cross-user authorization: user B must never see/touch user A's data
  // ---------------------------------------------------------------------
  describe('cross-user isolation', () => {
    afterEach(() => loginAs(userA));

    it("user B's lists never include user A's rows", async () => {
      loginAs(userB);
      const [transactions, goals, tasks, recurrings, reminders] =
        await Promise.all([
          http.get('/transactions').expect(200),
          http.get('/goals').expect(200),
          http.get('/tasks').expect(200),
          http.get('/recurrings').expect(200),
          http.get('/reminders').expect(200),
        ]);
      expect(transactions.body).toEqual([]);
      expect(goals.body).toEqual([]);
      expect(tasks.body).toEqual([]);
      expect(recurrings.body).toEqual([]);
      expect(reminders.body).toEqual([]);
    });

    it("user B gets 404 touching user A's transaction/goal/task/recurring/reminder", async () => {
      loginAs(userB);
      await http
        .patch(`/transactions/${keptExpenseTxId}`)
        .send({ amountCents: 1 })
        .expect(404);
      await http.delete(`/transactions/${keptExpenseTxId}`).expect(404);
      await http
        .post(`/goals/${goalId}/deposit`)
        .send({ amountCents: 1 })
        .expect(404);
      await http.post(`/tasks/${taskBId}/complete`).expect(404);
      await http
        .patch(`/recurrings/${recurringId}`)
        .send({ amountCents: 1 })
        .expect(404);
      await http.delete(`/recurrings/${recurringId}`).expect(404);
    });
  });
});

function dayMinus(day: string, amount: number): Date {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - amount);
  return date;
}
