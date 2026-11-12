import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { FastifyInstance } from "fastify";

import { createRequireCandidate } from "../src/middleware/candidate-auth.js";
import { installApiAuthGuards } from "../src/middleware/api-auth-guards.js";
import { studyPlanRoutes } from "../src/routes/study-plan.routes.js";
import {
  createDailyStudyPlanGenerator,
  localStudyDate,
  type DailyStudyPlanItemRow,
  type DailyStudyPlanRow,
  type DailyStudyPlanStore,
  type DailyStudyPlanTransaction,
} from "../src/services/daily-study-plan.service.js";
import { buildCandidateAction } from "../src/services/best-action-candidate.service.js";
import type {
  CandidateBestAction,
  CandidateBestActionTopic,
} from "../src/services/best-action-candidate.service.js";
import { hashToken } from "../src/security/auth-token.js";
import type {
  RecordDailyPlanItemDecisionInput,
  RecordDailyPlanItemDecisionResult,
} from "../src/services/daily-plan-item-event.service.js";

const candidateA = "11111111-1111-4111-8111-111111111111";
const candidateB = "22222222-2222-4222-8222-222222222222";
const tokenA = "daily-plan-token-a";
const tokenB = "daily-plan-token-b";
const idempotencyKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fixedNow = new Date("2026-11-12T15:00:00.000Z");

type State = { plans: DailyStudyPlanRow[]; items: DailyStudyPlanItemRow[] };

function createFakeStore(options: { failItems?: boolean; initial?: State } = {}) {
  let state: State = structuredClone(options.initial ?? { plans: [], items: [] });
  let queue = Promise.resolve();
  let nextId = 1;
  let itemInsertCount = 0;

  const store: DailyStudyPlanStore = {
    async transaction(operation) {
      let release!: () => void;
      const previous = queue;
      queue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const working: State = structuredClone(state);
      const transaction: DailyStudyPlanTransaction = {
        async lockIdempotency() {},
        async lockCandidateDate() {},
        async findByIdempotency(candidateId, key) {
          const plan = working.plans.find((row) => row.candidateId === candidateId && row.idempotencyKey === key);
          return plan ? {
            plan: structuredClone(plan),
            items: structuredClone(working.items.filter((item) => item.planId === plan.id && item.candidateId === candidateId)),
          } : undefined;
        },
        async getNextVersion(candidateId, planDate) {
          return Math.max(0, ...working.plans
            .filter((row) => row.candidateId === candidateId && row.planDate === planDate)
            .map((row) => row.version)) + 1;
        },
        async insertPlan(input) {
          const row = { ...input, id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}` };
          working.plans.push(row);
          return structuredClone(row);
        },
        async insertItems(inputs) {
          itemInsertCount += inputs.length;
          if (options.failItems) throw new Error("SYNTHETIC_ITEM_INSERT_FAILURE");
          const rows = inputs.map((input) => ({
            ...input,
            id: `10000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
          }));
          working.items.push(...rows);
          return structuredClone(rows);
        },
      };
      try {
        const result = await operation(transaction);
        state = working;
        return result;
      } finally {
        release();
      }
    },
  };

  return {
    store,
    snapshot: () => structuredClone(state),
    itemInsertCount: () => itemInsertCount,
  };
}

function topic(index: number, overrides: Partial<CandidateBestActionTopic> = {}): CandidateBestActionTopic {
  return {
    topicId: `${String(index).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`,
    topicName: `Tópico ${index}`,
    subjectName: `Disciplina ${index}`,
    mastery: index === 1 ? 30 : 70,
    masteryStatus: "weak",
    reliability: "moderate",
    trend: "stable",
    priorityScore: 90 - index,
    priorityLevel: index === 1 ? "high" : "medium",
    coverageFactor: 50,
    reviewFactor: 0,
    attempts: index === 1 ? 5 : 0,
    evaluationStatus: index === 1 ? "evaluated" : "not_evaluated",
    ...overrides,
  };
}

const rankedTopics = [topic(1), ...Array.from({ length: 8 }, (_, index) => topic(index + 2))];
const bestAction: CandidateBestAction = {
  ...buildCandidateAction(rankedTopics[0]),
  explanation: "Snapshot da melhor ação.",
  expectedImpact: "Impacto da melhor ação.",
};

function createTestApp(options: {
  candidateId?: string;
  best?: CandidateBestAction | null;
  topics?: CandidateBestActionTopic[];
  failItems?: boolean;
  initial?: State;
  recordDecision?: (input: RecordDailyPlanItemDecisionInput) => Promise<RecordDailyPlanItemDecisionResult>;
} = {}) {
  const candidateByHash = new Map([
    [hashToken(tokenA), candidateA],
    [hashToken(tokenB), candidateB],
  ]);
  const fake = createFakeStore({ failItems: options.failItems, initial: options.initial });
  const calls = { best: [] as string[], ranking: [] as string[], topicActions: [] as string[] };
  const decisionCalls: RecordDailyPlanItemDecisionInput[] = [];
  const generator = createDailyStudyPlanGenerator(fake.store, {
    async getBestAction(candidateId) {
      calls.best.push(candidateId);
      return options.best === undefined ? bestAction : options.best;
    },
    async getRankedTopics(candidateId) {
      calls.ranking.push(candidateId);
      return options.topics ?? rankedTopics;
    },
    getTopicAction(value) {
      calls.topicActions.push(value.topicId);
      return buildCandidateAction(value);
    },
  }, () => fixedNow);

  const app = Fastify();
  void app.register(cookie);
  installApiAuthGuards(app, createRequireCandidate({
    async resolveSession(tokenHash) {
      const candidateId = candidateByHash.get(tokenHash);
      return candidateId ? { candidateId, sessionId: `session-${candidateId}` } : undefined;
    },
  }), []);
  void app.register(studyPlanRoutes, {
    generateDailyStudyPlan: generator,
    async getCurrentPlan(candidateId, planDate) {
      const state = fake.snapshot();
      const plan = state.plans
        .filter((row) => row.candidateId === candidateId && row.planDate === planDate)
        .sort((left, right) => right.version - left.version)[0];
      if (!plan) return undefined;
      return {
        plan,
        items: state.items
          .filter((item) => item.candidateId === candidateId && item.planId === plan.id)
          .sort((left, right) => left.presentationOrder - right.presentationOrder),
      };
    },
    async listPlans(candidateId, filters) {
      const state = fake.snapshot();
      const matching = state.plans
        .filter((plan) => plan.candidateId === candidateId)
        .filter((plan) => !filters.from || plan.planDate >= filters.from)
        .filter((plan) => !filters.to || plan.planDate <= filters.to)
        .sort((left, right) => right.planDate.localeCompare(left.planDate) || right.version - left.version);
      const offset = (filters.page - 1) * filters.limit;
      return {
        plans: matching.slice(offset, offset + filters.limit).map((plan) => ({
          id: plan.id,
          planDate: plan.planDate,
          availableMinutes: plan.availableMinutes,
          version: plan.version,
          generatedAt: plan.generatedAt,
          itemCount: state.items.filter((item) => item.candidateId === candidateId && item.planId === plan.id).length,
        })),
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total: matching.length,
          totalPages: Math.ceil(matching.length / filters.limit),
        },
      };
    },
    async getPlanDetails(candidateId, planId) {
      const state = fake.snapshot();
      const plan = state.plans.find((row) => row.candidateId === candidateId && row.id === planId);
      if (!plan) return undefined;
      return {
        plan,
        items: state.items
          .filter((item) => item.candidateId === candidateId && item.planId === plan.id)
          .sort((left, right) => left.presentationOrder - right.presentationOrder),
      };
    },
    async recordItemDecision(input) {
      decisionCalls.push(input);
      if (options.recordDecision) return options.recordDecision(input);
      return {
        replayed: false,
        event: {
          id: "75000000-0000-4000-8000-000000000001",
          candidateId: input.candidateId,
          planId: input.planId,
          planItemId: input.planItemId,
          eventType: input.eventType,
          occurredAt: fixedNow,
          data: input.replacementTopicId ? { replacementTopicId: input.replacementTopicId } : null,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: "a".repeat(64),
        },
      };
    },
  });
  return app.ready().then(() => ({ app, fake, calls, decisionCalls }));
}

function previousLocalDate(date: string) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function planRow(id: string, candidateId: string, planDate: string, version: number): DailyStudyPlanRow {
  return {
    id,
    candidateId,
    planDate,
    timeZone: "America/Sao_Paulo",
    availableMinutes: 120,
    generatedAt: new Date(`${planDate}T15:00:00.000Z`),
    version,
    idempotencyKey: `${String(version).padStart(8, "0")}-aaaa-4aaa-8aaa-${id.slice(-12)}`,
  };
}

function itemRow(
  plan: DailyStudyPlanRow,
  order: number,
  topicIndex: number,
): DailyStudyPlanItemRow {
  return {
    id: `90000000-0000-4000-8000-${String(topicIndex).padStart(12, "0")}`,
    planId: plan.id,
    candidateId: plan.candidateId,
    presentationOrder: order,
    rankingPosition: order,
    topicId: topic(topicIndex).topicId,
    topicName: `Snapshot topic ${topicIndex}`,
    subjectName: `Snapshot subject ${topicIndex}`,
    activityType: "study",
    recommendedDurationMinutes: 30,
    priorityLevel: "high",
    priorityScore: 88,
    reason: ["weak_mastery"],
    explanation: `Original explanation ${topicIndex}`,
    expectedImpact: `Original impact ${topicIndex}`,
    recommendationSource: order === 1 ? "best_action" : "additional_topic",
  };
}

function postPlan(app: FastifyInstance, token = tokenA, body: unknown = { availableMinutes: 120 }, key = idempotencyKey) {
  return app.inject({
    method: "POST",
    url: "/api/study-plans/generate",
    headers: { cookie: `candidate_session=${token}`, "idempotency-key": key },
    payload: body,
  });
}

test("gera e persiste plano e itens com snapshot em ordem adaptativa", async (t) => {
  const { app, fake, calls } = await createTestApp();
  t.after(() => app.close());

  const response = await postPlan(app);
  assert.equal(response.statusCode, 201);
  const result = response.json();
  assert.equal(result.plan.planDate, "2026-11-12");
  assert.equal(result.plan.timeZone, "America/Sao_Paulo");
  assert.equal(result.plan.version, 1);
  assert.equal(result.plan.availableMinutes, 120);
  assert.deepEqual(result.items.map((item: { presentationOrder: number }) => item.presentationOrder), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(result.items.map((item: { topicId: string }) => item.topicId), rankedTopics.slice(0, 6).map((value) => value.topicId));
  assert.equal(result.items[0].recommendationSource, "best_action");
  assert.equal("execution" in result.items[0], false);
  assert.equal(result.items[0].explanation, "Snapshot da melhor ação.");
  assert.equal(result.items[0].expectedImpact, "Impacto da melhor ação.");
  assert.equal(result.items[1].activityType, "questions");
  assert.equal(result.items[1].recommendedDurationMinutes, 10);
  assert.equal(fake.snapshot().plans.length, 1);
  assert.equal(fake.snapshot().items.length, result.items.length);
  assert.deepEqual(calls.best, [candidateA]);
  assert.deepEqual(calls.ranking, [candidateA]);
  assert.equal(calls.topicActions.length, 5);
});

test("não duplica o tópico principal e limita recomendações adicionais a cinco", async (t) => {
  const duplicatedRanking = [rankedTopics[0], rankedTopics[0], ...rankedTopics.slice(1)];
  const { app, calls } = await createTestApp({ topics: duplicatedRanking });
  t.after(() => app.close());

  const response = await postPlan(app);
  assert.equal(response.statusCode, 201);
  const items = response.json().items;
  assert.equal(items.filter((item: { topicId: string }) => item.topicId === bestAction.topicId).length, 1);
  assert.equal(calls.topicActions.length, 5);
  assert.equal(items.length, 6);
});

test("inclui somente atividades adicionais que cabem integralmente no restante", async (t) => {
  const { app } = await createTestApp();
  t.after(() => app.close());

  const response = await postPlan(app, tokenA, { availableMinutes: 45 });
  assert.equal(response.statusCode, 201);
  const durations = response.json().items.map((item: { recommendedDurationMinutes: number }) => item.recommendedDurationMinutes);
  assert.deepEqual(durations, [30, 10]);
  assert.ok(durations.slice(1).reduce((sum: number, value: number) => sum + value, durations[0]) <= 45);
});

test("mantém a melhor ação quando ela excede a disponibilidade e não adiciona tópicos", async (t) => {
  const longAction = { ...bestAction, durationMinutes: 30 };
  const { app, calls } = await createTestApp({ best: longAction });
  t.after(() => app.close());

  const response = await postPlan(app, tokenA, { availableMinutes: 5 });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().items.length, 1);
  assert.equal(response.json().items[0].recommendedDurationMinutes, 30);
  assert.equal(calls.topicActions.length, 0);
});

test("NO_ACTION_AVAILABLE não cria plano nem itens", async (t) => {
  const { app, fake } = await createTestApp({ best: null });
  t.after(() => app.close());

  const response = await postPlan(app);
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "NO_ACTION_AVAILABLE");
  assert.deepEqual(fake.snapshot(), { plans: [], items: [] });
});

test("idempotência retorna o mesmo plano e conflita se a disponibilidade mudar", async (t) => {
  const { app, fake } = await createTestApp();
  t.after(() => app.close());

  const first = await postPlan(app);
  const replay = await postPlan(app);
  const conflict = await postPlan(app, tokenA, { availableMinutes: 90 });
  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().plan.id, first.json().plan.id);
  assert.deepEqual(replay.json().items, first.json().items);
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error, "IDEMPOTENCY_CONFLICT");
  assert.equal(fake.snapshot().plans.length, 1);
});

test("cria próxima versão diária e planos separados para candidatos distintos", async (t) => {
  const { app, fake } = await createTestApp();
  t.after(() => app.close());

  const versionOne = await postPlan(app, tokenA, { availableMinutes: 60 }, idempotencyKey);
  const versionTwo = await postPlan(app, tokenA, { availableMinutes: 75 }, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  const otherCandidate = await postPlan(app, tokenB, { availableMinutes: 60 }, idempotencyKey);
  assert.equal(versionOne.json().plan.version, 1);
  assert.equal(versionTwo.json().plan.version, 2);
  assert.equal(otherCandidate.statusCode, 201);
  assert.equal(otherCandidate.json().plan.version, 1);
  assert.equal(fake.snapshot().plans.length, 3);
  assert.equal(new Set(fake.snapshot().plans.map((plan) => plan.candidateId)).size, 2);
});

test("exige autenticação e valida corpo e chave de idempotência", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  const unauthorized = await app.inject({ method: "POST", url: "/api/study-plans/generate", payload: { availableMinutes: 120 } });
  const invalidBody = await postPlan(app, tokenA, { availableMinutes: 0 });
  const tooLong = await postPlan(app, tokenA, { availableMinutes: 721 });
  const extraField = await postPlan(app, tokenA, { availableMinutes: 120, untrustedPriority: 100 });
  const otherCandidate = await postPlan(app, tokenA, { availableMinutes: 120, candidateId: candidateB });
  const invalidKey = await app.inject({ method: "POST", url: "/api/study-plans/generate", headers: { cookie: `candidate_session=${tokenA}`, "idempotency-key": "bad" }, payload: { availableMinutes: 120 } });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(invalidBody.statusCode, 400);
  assert.equal(tooLong.statusCode, 400);
  assert.equal(extraField.statusCode, 400);
  assert.equal(otherCandidate.statusCode, 403);
  assert.equal(invalidKey.statusCode, 400);
  assert.equal(calls.best.length, 0);
});

test("falha ao inserir item reverte atomicamente plano e itens", async (t) => {
  const { app, fake } = await createTestApp({ failItems: true });
  t.after(() => app.close());

  const response = await postPlan(app);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(fake.snapshot(), { plans: [], items: [] });
});

test("serializa concorrência de versões para candidato e dia", async (t) => {
  const { app, fake } = await createTestApp();
  t.after(() => app.close());

  const [first, second] = await Promise.all([
    postPlan(app, tokenA, { availableMinutes: 60 }, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
    postPlan(app, tokenA, { availableMinutes: 75 }, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
  ]);
  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 201);
  assert.deepEqual([first.json().plan.version, second.json().plan.version].sort(), [1, 2]);
  assert.equal(fake.snapshot().plans.length, 2);
});

test("GET current escolhe a maior versão local e devolve snapshot ordenado sem alterar dados", async (t) => {
  const today = localStudyDate(new Date());
  const currentV1 = planRow("50000000-0000-4000-8000-000000000001", candidateA, today, 1);
  const currentV2 = planRow("50000000-0000-4000-8000-000000000002", candidateA, today, 2);
  const previous = planRow("50000000-0000-4000-8000-000000000003", candidateA, previousLocalDate(today), 1);
  const initial: State = {
    plans: [currentV1, currentV2, previous],
    items: [itemRow(currentV2, 2, 2), itemRow(currentV2, 1, 1)],
  };
  const { app, fake, calls } = await createTestApp({ initial });
  t.after(() => app.close());

  const before = fake.snapshot();
  const current = await app.inject({ method: "GET", url: "/api/study-plans/current", headers: { cookie: `candidate_session=${tokenA}` } });
  const absent = await app.inject({ method: "GET", url: "/api/study-plans/current", headers: { cookie: `candidate_session=${tokenB}` } });
  assert.equal(current.statusCode, 200);
  assert.equal(current.json().plan.id, currentV2.id);
  assert.equal(current.json().plan.version, 2);
  assert.deepEqual(current.json().items.map((item: { presentationOrder: number }) => item.presentationOrder), [1, 2]);
  assert.equal(current.json().items[0].explanation, "Original explanation 1");
  assert.deepEqual(current.json().items[0].execution, {
    executedMinutes: 0,
    sessionCount: 0,
    recommendedTimePercent: 0,
    status: "not_started",
    lastSessionAt: null,
    events: [],
  });
  assert.deepEqual(absent.json(), { plan: null, items: [] });
  assert.deepEqual(fake.snapshot(), before);
  assert.deepEqual(calls, { best: [], ranking: [], topicActions: [] });
});

test("GET plans filtra datas, ordena data/versão, conta itens e pagina por candidato", async (t) => {
  const today = localStudyDate(new Date());
  const yesterday = previousLocalDate(today);
  const twoDaysAgo = previousLocalDate(yesterday);
  const plansA = [
    planRow("51000000-0000-4000-8000-000000000001", candidateA, today, 1),
    planRow("51000000-0000-4000-8000-000000000002", candidateA, today, 2),
    planRow("51000000-0000-4000-8000-000000000003", candidateA, yesterday, 1),
    planRow("51000000-0000-4000-8000-000000000004", candidateA, yesterday, 2),
    planRow("51000000-0000-4000-8000-000000000005", candidateA, twoDaysAgo, 1),
  ];
  const planB = planRow("52000000-0000-4000-8000-000000000001", candidateB, today, 1);
  const initial: State = {
    plans: [...plansA, planB],
    items: [itemRow(plansA[0], 1, 1), itemRow(plansA[0], 2, 2), itemRow(plansA[1], 1, 3), itemRow(planB, 1, 4)],
  };
  const { app } = await createTestApp({ initial });
  t.after(() => app.close());

  const firstPage = await app.inject({ method: "GET", url: "/api/study-plans?page=1&limit=2", headers: { cookie: `candidate_session=${tokenA}` } });
  const secondPage = await app.inject({ method: "GET", url: "/api/study-plans?page=2&limit=2", headers: { cookie: `candidate_session=${tokenA}` } });
  const dateRange = await app.inject({ method: "GET", url: `/api/study-plans?from=${yesterday}&to=${today}`, headers: { cookie: `candidate_session=${tokenA}` } });
  const otherCandidate = await app.inject({ method: "GET", url: "/api/study-plans", headers: { cookie: `candidate_session=${tokenB}` } });
  assert.deepEqual(firstPage.json().plans.map((plan: { id: string }) => plan.id), [plansA[1].id, plansA[0].id]);
  assert.deepEqual(firstPage.json().plans.map((plan: { version: number }) => plan.version), [2, 1]);
  assert.deepEqual(firstPage.json().plans.map((plan: { itemCount: number }) => plan.itemCount), [1, 2]);
  assert.deepEqual(firstPage.json().pagination, { page: 1, limit: 2, total: 5, totalPages: 3 });
  assert.deepEqual(secondPage.json().plans.map((plan: { id: string }) => plan.id), [plansA[3].id, plansA[2].id]);
  assert.equal(dateRange.json().pagination.total, 4);
  assert.deepEqual(otherCandidate.json().plans.map((plan: { id: string }) => plan.id), [planB.id]);
});

test("GET planId retorna snapshot completo ordenado e oculta plano inexistente ou de outro candidato", async (t) => {
  const today = localStudyDate(new Date());
  const planA = planRow("53000000-0000-4000-8000-000000000001", candidateA, today, 1);
  const initial: State = {
    plans: [planA],
    items: [itemRow(planA, 2, 2), itemRow(planA, 1, 1)],
  };
  const { app } = await createTestApp({ initial });
  t.after(() => app.close());

  const own = await app.inject({ method: "GET", url: `/api/study-plans/${planA.id}`, headers: { cookie: `candidate_session=${tokenA}` } });
  const foreign = await app.inject({ method: "GET", url: `/api/study-plans/${planA.id}`, headers: { cookie: `candidate_session=${tokenB}` } });
  const missing = await app.inject({ method: "GET", url: "/api/study-plans/54000000-0000-4000-8000-000000000001", headers: { cookie: `candidate_session=${tokenA}` } });
  assert.equal(own.statusCode, 200);
  assert.deepEqual(own.json().items.map((item: { presentationOrder: number }) => item.presentationOrder), [1, 2]);
  assert.equal(own.json().items[0].topicName, "Snapshot topic 1");
  assert.equal(own.json().items[0].reason[0], "weak_mastery");
  assert.equal(own.json().items[0].expectedImpact, "Original impact 1");
  assert.equal(own.json().items[0].execution.status, "not_started");
  assert.equal(foreign.statusCode, 404);
  assert.deepEqual(foreign.json(), missing.json());
});

test("consultas de planos exigem sessão e rejeitam filtros desconhecidos ou inválidos", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  const unauthenticated = await app.inject({ method: "GET", url: "/api/study-plans/current" });
  const badDate = await app.inject({ method: "GET", url: "/api/study-plans?from=2026-02-30", headers: { cookie: `candidate_session=${tokenA}` } });
  const inverted = await app.inject({ method: "GET", url: "/api/study-plans?from=2026-11-12&to=2026-11-11", headers: { cookie: `candidate_session=${tokenA}` } });
  const unknown = await app.inject({ method: "GET", url: `/api/study-plans?candidateId=${candidateB}`, headers: { cookie: `candidate_session=${tokenA}` } });
  const unknownParameter = await app.inject({ method: "GET", url: "/api/study-plans?unexpected=value", headers: { cookie: `candidate_session=${tokenA}` } });
  const largeLimit = await app.inject({ method: "GET", url: "/api/study-plans?limit=101", headers: { cookie: `candidate_session=${tokenA}` } });
  const badId = await app.inject({ method: "GET", url: "/api/study-plans/not-a-uuid", headers: { cookie: `candidate_session=${tokenA}` } });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(badDate.statusCode, 400);
  assert.equal(inverted.statusCode, 400);
  assert.equal(unknown.statusCode, 403);
  assert.equal(unknownParameter.statusCode, 400);
  assert.equal(largeLimit.statusCode, 400);
  assert.equal(badId.statusCode, 400);
  assert.deepEqual(calls, { best: [], ranking: [], topicActions: [] });
});

test("registra decisões autenticadas com identidade da sessão e chave idempotente", async (t) => {
  const plan = planRow("76000000-0000-4000-8000-000000000001", candidateA, localStudyDate(new Date()), 1);
  const item = itemRow(plan, 1, 1);
  const { app, decisionCalls } = await createTestApp({ initial: { plans: [plan], items: [item] } });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/study-plans/${plan.id}/items/${item.id}/complete`,
    headers: { cookie: `candidate_session=${tokenA}`, "idempotency-key": idempotencyKey },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().eventType, "completed");
  assert.deepEqual(decisionCalls, [{
    candidateId: candidateA,
    planId: plan.id,
    planItemId: item.id,
    eventType: "completed",
    idempotencyKey,
  }]);

  const unauthenticated = await app.inject({
    method: "POST",
    url: `/api/study-plans/${plan.id}/items/${item.id}/ignore`,
    headers: { "idempotency-key": idempotencyKey },
  });
  const missingKey = await app.inject({
    method: "POST",
    url: `/api/study-plans/${plan.id}/items/${item.id}/ignore`,
    headers: { cookie: `candidate_session=${tokenA}` },
  });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(missingKey.statusCode, 400);
  assert.equal(decisionCalls.length, 1);
});

test("substituição exige um tópico UUID e encaminha somente o tópico alternativo", async (t) => {
  const plan = planRow("77000000-0000-4000-8000-000000000001", candidateA, localStudyDate(new Date()), 1);
  const item = itemRow(plan, 1, 1);
  const { app, decisionCalls } = await createTestApp({ initial: { plans: [plan], items: [item] } });
  t.after(() => app.close());

  const missingTopic = await app.inject({
    method: "POST",
    url: `/api/study-plans/${plan.id}/items/${item.id}/replace`,
    headers: { cookie: `candidate_session=${tokenA}`, "idempotency-key": idempotencyKey },
    payload: {},
  });
  const topicId = topic(2).topicId;
  const replaced = await app.inject({
    method: "POST",
    url: `/api/study-plans/${plan.id}/items/${item.id}/replace`,
    headers: { cookie: `candidate_session=${tokenA}`, "idempotency-key": idempotencyKey },
    payload: { replacementTopicId: topicId },
  });

  assert.equal(missingTopic.statusCode, 400);
  assert.equal(replaced.statusCode, 201);
  assert.deepEqual(decisionCalls, [{
    candidateId: candidateA,
    planId: plan.id,
    planItemId: item.id,
    eventType: "replaced",
    idempotencyKey,
    replacementTopicId: topicId,
  }]);
});

test("mapeia decisões terminais incompatíveis para HTTP 409", async (t) => {
  const plan = planRow("78000000-0000-4000-8000-000000000001", candidateA, localStudyDate(new Date()), 1);
  const item = itemRow(plan, 1, 1);
  const { app } = await createTestApp({
    initial: { plans: [plan], items: [item] },
    async recordDecision() {
      throw new Error("DAILY_PLAN_ITEM_ALREADY_DECIDED");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/study-plans/${plan.id}/items/${item.id}/ignore`,
    headers: { cookie: `candidate_session=${tokenA}`, "idempotency-key": idempotencyKey },
  });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { error: "DAILY_PLAN_ITEM_ALREADY_DECIDED" });
});
