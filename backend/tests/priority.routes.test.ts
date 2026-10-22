import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import {
  priorityRoutes,
  type PriorityRouteDependencies,
} from "../src/routes/priority.routes.js";
import type {
  PerformancePriorityContext,
  TopicPriority,
  TopicPriorityInput,
  WeightPriorityContext,
} from "../src/domain/priority/priority.schema,.js";

const topicId = "22222222-2222-4222-8222-222222222222";
const candidateId = "11111111-1111-4111-8111-111111111111";

const priority: TopicPriority = {
  score: 61.25,
  level: "high",
  factors: {
    deficit: 45,
    weight: 60,
    incidence: 30,
    coverage: 40,
    review: 75,
    trend: 50,
    errors: 25,
    urgency: 20,
  },
};

const validFactors: TopicPriorityInput = {
  deficit: 45,
  weight: 60,
  incidence: 30,
  coverage: 40,
  review: 75,
  trend: 50,
  errors: 25,
  urgency: 20,
};

const validPerformanceInput = {
  mastery: 72,
  trend: "decline" as const,
  attempts: 10,
  incorrectAnswers: 3,
  weight: 4,
  maxWeight: 8,
  examDate: "2026-05-15T12:00:00.000Z",
};

async function createTestApp(
  overrides: Partial<PriorityRouteDependencies> = {},
) {
  const app = Fastify();
  const dependencies: PriorityRouteDependencies = {
    getCandidateStatus: async (id) => ({ id, isActive: true }),
    calculateTopicPriority: (_factors: TopicPriorityInput) => priority,
    buildPriorityFromPerformance: () => priority.factors,
    calculateTopicPriorityForCandidate: async () => priority,
    getTopicWeightPriority: async () => ({
      weight: 1,
      maxWeight: 1,
      examDate: null,
    }),
    getTopicIncidencePriority: async () => 100,
    ...overrides,
  };

  await app.register(priorityRoutes, dependencies);
  return app;
}

test("topicId inválido retorna 400 sem consultar candidato nem calcular", async (t) => {
  let candidateLookups = 0;
  let priorityCalls = 0;
  const app = await createTestApp({
    getCandidateStatus: async () => {
      candidateLookups += 1;
      return { id: candidateId, isActive: true };
    },
    calculateTopicPriorityForCandidate: async () => {
      priorityCalls += 1;
      return priority;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/not-a-uuid?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "Parâmetros inválidos");
  assert.ok(response.json().details.fieldErrors.topicId);
  assert.equal(candidateLookups, 0);
  assert.equal(priorityCalls, 0);
});

test("candidateId inválido retorna 400 sem consultar candidato nem calcular", async (t) => {
  let candidateLookups = 0;
  let priorityCalls = 0;
  const app = await createTestApp({
    getCandidateStatus: async () => {
      candidateLookups += 1;
      return { id: candidateId, isActive: true };
    },
    calculateTopicPriorityForCandidate: async () => {
      priorityCalls += 1;
      return priority;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}?candidateId=not-a-uuid`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "Query inválida");
  assert.ok(response.json().details.fieldErrors.candidateId);
  assert.equal(candidateLookups, 0);
  assert.equal(priorityCalls, 0);
});

test("candidateId ausente retorna 400 sem consultar candidato nem calcular", async (t) => {
  let candidateLookups = 0;
  let priorityCalls = 0;
  const app = await createTestApp({
    getCandidateStatus: async () => {
      candidateLookups += 1;
      return { id: candidateId, isActive: true };
    },
    calculateTopicPriorityForCandidate: async () => {
      priorityCalls += 1;
      return priority;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "Query inválida");
  assert.ok(response.json().details.fieldErrors.candidateId);
  assert.equal(candidateLookups, 0);
  assert.equal(priorityCalls, 0);
});

test("candidato inexistente retorna 404 sem calcular prioridade", async (t) => {
  let priorityCalls = 0;
  const candidateLookups: string[] = [];
  const app = await createTestApp({
    getCandidateStatus: async (id) => {
      candidateLookups.push(id);
      return undefined;
    },
    calculateTopicPriorityForCandidate: async () => {
      priorityCalls += 1;
      return priority;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "CANDIDATE_NOT_FOUND" });
  assert.deepEqual(candidateLookups, [candidateId]);
  assert.equal(priorityCalls, 0);
});

test("candidato inativo retorna 403 sem calcular prioridade", async (t) => {
  let priorityCalls = 0;
  const candidateLookups: string[] = [];
  const app = await createTestApp({
    getCandidateStatus: async (id) => {
      candidateLookups.push(id);
      return { id, isActive: false };
    },
    calculateTopicPriorityForCandidate: async () => {
      priorityCalls += 1;
      return priority;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "CANDIDATE_INACTIVE" });
  assert.deepEqual(candidateLookups, [candidateId]);
  assert.equal(priorityCalls, 0);
});

test("retorna TopicPriority e encaminha topicId e candidateId", async (t) => {
  const priorityCalls: Array<[string, string]> = [];
  const operationOrder: string[] = [];
  const app = await createTestApp({
    getCandidateStatus: async (id) => {
      operationOrder.push("candidate");
      return { id, isActive: true };
    },
    calculateTopicPriorityForCandidate: async (...ids) => {
      operationOrder.push("calculate");
      priorityCalls.push(ids);
      return priority;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), priority);
  assert.deepEqual(priorityCalls, [[topicId, candidateId]]);
  assert.deepEqual(operationOrder, ["candidate", "calculate"]);
});

test("mapeia TOPIC_NOT_FOUND para 404 com o corpo atual", async (t) => {
  const app = await createTestApp({
    calculateTopicPriorityForCandidate: async () => {
      throw new Error("TOPIC_NOT_FOUND");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "Tópico não encontrado" });
});

test("erro inesperado retorna 500 com o corpo atual", async (t) => {
  const app = await createTestApp({
    calculateTopicPriorityForCandidate: async () => {
      throw new Error("unexpected priority failure");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: "Erro interno ao calcular prioridade",
  });
});

test("POST /calculate retorna TopicPriority e passa os oito fatores validados", async (t) => {
  const received: TopicPriorityInput[] = [];
  const app = await createTestApp({
    calculateTopicPriority: (factors) => {
      received.push(factors);
      return priority;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/priority/calculate",
    payload: validFactors,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), priority);
  assert.deepEqual(received, [validFactors]);
});

test("POST /calculate rejeita campos ausentes, tipos incorretos e valores fora do intervalo", async (t) => {
  let calculateCalls = 0;
  const app = await createTestApp({
    calculateTopicPriority: () => {
      calculateCalls += 1;
      return priority;
    },
  });
  t.after(() => app.close());

  const invalidPayloads = [
    Object.fromEntries(
      Object.entries(validFactors).filter(([key]) => key !== "deficit"),
    ),
    { ...validFactors, weight: "60" },
    { ...validFactors, deficit: -1 },
    { ...validFactors, urgency: 101 },
  ];

  for (const payload of invalidPayloads) {
    const response = await app.inject({
      method: "POST",
      url: "/api/priority/calculate",
      payload,
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json().error, "Dados inválidos");
    assert.ok(response.json().details.fieldErrors);
  }

  assert.equal(calculateCalls, 0);
});

test("POST /from-performance retorna TopicPriority e converte examDate para Date", async (t) => {
  const performanceCalls: Array<[PerformancePriorityContext, WeightPriorityContext]> = [];
  const calculationCalls: TopicPriorityInput[] = [];
  const app = await createTestApp({
    buildPriorityFromPerformance: (performance, weightContext) => {
      assert.ok(weightContext);
      performanceCalls.push([performance, weightContext]);
      return validFactors;
    },
    calculateTopicPriority: (factors) => {
      calculationCalls.push(factors);
      return priority;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/priority/from-performance",
    payload: validPerformanceInput,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), priority);
  assert.deepEqual(performanceCalls, [
    [
      {
        mastery: 72,
        trend: "decline",
        attempts: 10,
        incorrectAnswers: 3,
      },
      {
        weight: 4,
        maxWeight: 8,
        examDate: new Date(validPerformanceInput.examDate),
      },
    ],
  ]);
  assert.deepEqual(calculationCalls, [validFactors]);
});

test("POST /from-performance preserva examDate nulo e pesos nulos", async (t) => {
  const received: Array<[PerformancePriorityContext, WeightPriorityContext]> = [];
  const app = await createTestApp({
    buildPriorityFromPerformance: (performance, weightContext) => {
      assert.ok(weightContext);
      received.push([performance, weightContext]);
      return validFactors;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/priority/from-performance",
    payload: { ...validPerformanceInput, weight: null, maxWeight: null, examDate: null },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), priority);
  assert.deepEqual(received, [
    [
      {
        mastery: 72,
        trend: "decline",
        attempts: 10,
        incorrectAnswers: 3,
      },
      { weight: null, maxWeight: null, examDate: null },
    ],
  ]);
});

test("POST /from-performance rejeita campos ausentes e tipos incorretos sem calcular", async (t) => {
  let buildCalls = 0;
  let calculateCalls = 0;
  const app = await createTestApp({
    buildPriorityFromPerformance: () => {
      buildCalls += 1;
      return validFactors;
    },
    calculateTopicPriority: () => {
      calculateCalls += 1;
      return priority;
    },
  });
  t.after(() => app.close());

  const fields = Object.keys(validPerformanceInput);
  const invalidPayloads: unknown[] = fields.map((field) =>
    Object.fromEntries(
      Object.entries(validPerformanceInput).filter(([key]) => key !== field),
    ),
  );
  invalidPayloads.push(
    { ...validPerformanceInput, mastery: "72" },
    { ...validPerformanceInput, trend: 2 },
    { ...validPerformanceInput, attempts: "10" },
    { ...validPerformanceInput, incorrectAnswers: "3" },
    { ...validPerformanceInput, weight: "4" },
    { ...validPerformanceInput, maxWeight: "8" },
    { ...validPerformanceInput, examDate: 123 },
  );

  for (const payload of invalidPayloads) {
    const response = await app.inject({
      method: "POST",
      url: "/api/priority/from-performance",
      payload,
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "Dados inválidos");
    assert.ok(response.json().details.fieldErrors);
  }

  assert.equal(buildCalls, 0);
  assert.equal(calculateCalls, 0);
});

test("GET /topics/:topicId/incidence rejeita UUID inválido", async (t) => {
  let incidenceCalls = 0;
  const app = await createTestApp({
    getTopicIncidencePriority: async () => {
      incidenceCalls += 1;
      return 25;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/priority/topics/not-a-uuid/incidence",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "Parâmetros inválidos");
  assert.ok(response.json().details.fieldErrors.topicId);
  assert.equal(incidenceCalls, 0);
});

test("GET /topics/:topicId/incidence retorna incidência e encaminha topicId", async (t) => {
  const receivedTopicIds: string[] = [];
  const app = await createTestApp({
    getTopicIncidencePriority: async (receivedTopicId) => {
      receivedTopicIds.push(receivedTopicId);
      return 62.5;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}/incidence`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { topicId, incidence: 62.5 });
  assert.deepEqual(receivedTopicIds, [topicId]);
});

test("GET /topics/:topicId/incidence aceita incidência zero", async (t) => {
  const app = await createTestApp({
    getTopicIncidencePriority: async () => 0,
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}/incidence`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { topicId, incidence: 0 });
});

test("GET /topics/:topicId/incidence mapeia TOPIC_NOT_FOUND para 404", async (t) => {
  const app = await createTestApp({
    getTopicIncidencePriority: async () => {
      throw new Error("TOPIC_NOT_FOUND");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}/incidence`,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "Tópico não encontrado" });
});

test("GET /topics/:topicId/incidence retorna 500 com o corpo atual em erro inesperado", async (t) => {
  const app = await createTestApp({
    getTopicIncidencePriority: async () => {
      throw new Error("unexpected incidence failure");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}/incidence`,
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: "Erro interno ao calcular incidência",
  });
});

test("GET /topics/:topicId/weight rejeita UUID inválido", async (t) => {
  let weightCalls = 0;
  const app = await createTestApp({
    getTopicWeightPriority: async () => {
      weightCalls += 1;
      return { weight: 4, maxWeight: 8, examDate: null };
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/priority/topics/not-a-uuid/weight",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "Parâmetros inválidos");
  assert.ok(response.json().details.fieldErrors.topicId);
  assert.equal(weightCalls, 0);
});

test("GET /topics/:topicId/weight retorna WeightPriorityContext e encaminha topicId", async (t) => {
  const weightContext: WeightPriorityContext = {
    weight: 4,
    maxWeight: 8,
    examDate: new Date("2026-05-15T12:00:00.000Z"),
  };
  const receivedTopicIds: string[] = [];
  const app = await createTestApp({
    getTopicWeightPriority: async (receivedTopicId) => {
      receivedTopicIds.push(receivedTopicId);
      return weightContext;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}/weight`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    weight: 4,
    maxWeight: 8,
    examDate: weightContext.examDate?.toISOString(),
  });
  assert.deepEqual(receivedTopicIds, [topicId]);
});

test("GET /topics/:topicId/weight mapeia TOPIC_NOT_FOUND para 404", async (t) => {
  const app = await createTestApp({
    getTopicWeightPriority: async () => {
      throw new Error("TOPIC_NOT_FOUND");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}/weight`,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "Tópico não encontrado" });
});

test("GET /topics/:topicId/weight retorna 500 com o corpo atual em erro inesperado", async (t) => {
  const app = await createTestApp({
    getTopicWeightPriority: async () => {
      throw new Error("unexpected weight failure");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/priority/topics/${topicId}/weight`,
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: "Erro interno ao consultar peso do tópico",
  });
});

test("POST /from-performance rejeita limites, trend, inteiros, pesos e data inválidos", async (t) => {
  let buildCalls = 0;
  let calculateCalls = 0;
  const app = await createTestApp({
    buildPriorityFromPerformance: () => {
      buildCalls += 1;
      return validFactors;
    },
    calculateTopicPriority: () => {
      calculateCalls += 1;
      return priority;
    },
  });
  t.after(() => app.close());

  const invalidPayloads = [
    { ...validPerformanceInput, mastery: -1 },
    { ...validPerformanceInput, mastery: 101 },
    { ...validPerformanceInput, trend: "unknown" },
    { ...validPerformanceInput, attempts: -1 },
    { ...validPerformanceInput, attempts: 1.5 },
    { ...validPerformanceInput, incorrectAnswers: -1 },
    { ...validPerformanceInput, incorrectAnswers: 1.5 },
    { ...validPerformanceInput, weight: 0 },
    { ...validPerformanceInput, weight: -1 },
    { ...validPerformanceInput, maxWeight: 0 },
    { ...validPerformanceInput, maxWeight: -1 },
    { ...validPerformanceInput, examDate: "not-a-datetime" },
  ];

  for (const payload of invalidPayloads) {
    const response = await app.inject({
      method: "POST",
      url: "/api/priority/from-performance",
      payload,
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "Dados inválidos");
    assert.ok(response.json().details.fieldErrors);
  }

  assert.equal(buildCalls, 0);
  assert.equal(calculateCalls, 0);
});
