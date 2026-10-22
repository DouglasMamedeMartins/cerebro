import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import {
  candidateBestActionRoutes,
  type CandidateBestActionRouteDependencies,
} from "../src/routes/candidate-best-action.routes.js";
import type {
  CandidateBestAction,
  CandidateBestActionTopic,
} from "../src/services/best-action-candidate.service.js";

const candidateId = "11111111-1111-4111-8111-111111111111";
const asOf = "2026-05-15T12:00:00.000Z";
const bestActionUrl = `/api/candidates/${candidateId}/best-action?asOf=${encodeURIComponent(asOf)}`;
const topicsUrl = `/api/candidates/${candidateId}/best-action/topics?asOf=${encodeURIComponent(asOf)}`;

const action: CandidateBestAction = {
  topicId: "22222222-2222-4222-8222-222222222222",
  topicName: "Direito Constitucional",
  subjectName: "Direito",
  type: "review",
  durationMinutes: 20,
  priorityScore: 82,
  priorityLevel: "high",
  mastery: 58,
  masteryStatus: "weak",
  reliability: "moderate",
  trend: "stable",
  reason: ["weak_mastery", "review_due"],
  explanation: "Revisão recomendada para reforçar o conteúdo.",
  expectedImpact: "Recuperar o conteúdo e fortalecer a retenção.",
};

const topic: CandidateBestActionTopic = {
  topicId: action.topicId,
  topicName: action.topicName,
  subjectName: action.subjectName,
  mastery: action.mastery,
  masteryStatus: action.masteryStatus,
  reliability: action.reliability,
  trend: action.trend,
  priorityScore: action.priorityScore,
  priorityLevel: action.priorityLevel,
  coverageFactor: 40,
  reviewFactor: 75,
  attempts: 12,
  evaluationStatus: "evaluated",
};

async function createTestApp(
  overrides: Partial<CandidateBestActionRouteDependencies> = {},
) {
  const app = Fastify();
  const dependencies: CandidateBestActionRouteDependencies = {
    getCandidateBestAction: async () => action,
    getCandidateBestActionTopics: async () => [topic],
    ...overrides,
  };

  await app.register(candidateBestActionRoutes, dependencies);
  return app;
}

test("retorna 400 para UUID inválido e não chama serviços", async (t) => {
  let serviceCalls = 0;
  const app = await createTestApp({
    getCandidateBestAction: async () => {
      serviceCalls += 1;
      return action;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/candidates/not-a-uuid/best-action`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "INVALID_INPUT");
  assert.equal(serviceCalls, 0);
});

test("retorna 400 para asOf inválido e não chama serviços", async (t) => {
  let serviceCalls = 0;
  const app = await createTestApp({
    getCandidateBestAction: async () => {
      serviceCalls += 1;
      return action;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/candidates/${candidateId}/best-action?asOf=invalid`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "INVALID_INPUT");
  assert.equal(serviceCalls, 0);
});

for (const [errorCode, statusCode] of [
  ["CANDIDATE_NOT_FOUND", 404],
  ["CANDIDATE_INACTIVE", 403],
  ["CANDIDATE_WITHOUT_EDITAL", 400],
] as const) {
  test(`mapeia ${errorCode} para HTTP ${statusCode}`, async (t) => {
    const calls: Array<[string, Date | undefined]> = [];
    const app = await createTestApp({
      getCandidateBestAction: async (...args) => {
        calls.push(args);
        throw new Error(errorCode);
      },
    });
    t.after(() => app.close());

    const response = await app.inject({ method: "GET", url: bestActionUrl });

    assert.equal(response.statusCode, statusCode);
    assert.deepEqual(response.json(), { error: errorCode });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], candidateId);
    assert.equal(calls[0][1]?.toISOString(), asOf);
  });
}

test("retorna 404 NO_ACTION_AVAILABLE quando o serviço não encontra ação", async (t) => {
  const calls: Array<[string, Date | undefined]> = [];
  const app = await createTestApp({
    getCandidateBestAction: async (...args) => {
      calls.push(args);
      return null;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: bestActionUrl });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "NO_ACTION_AVAILABLE" });
  assert.equal(calls[0][0], candidateId);
  assert.equal(calls[0][1]?.toISOString(), asOf);
});

test("retorna a ação real do contrato com HTTP 200", async (t) => {
  const calls: Array<[string, Date | undefined]> = [];
  const app = await createTestApp({
    getCandidateBestAction: async (...args) => {
      calls.push(args);
      return action;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: bestActionUrl });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), action);
  assert.equal(calls[0][0], candidateId);
  assert.equal(calls[0][1]?.toISOString(), asOf);
});

test("propaga erro inesperado para o tratamento padrão do Fastify", async (t) => {
  const app = await createTestApp({
    getCandidateBestAction: async () => {
      throw new Error("unexpected service failure");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: bestActionUrl });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    statusCode: 500,
    error: "Internal Server Error",
    message: "unexpected service failure",
  });
});

test("valida entrada do endpoint de tópicos sem chamar o serviço", async (t) => {
  let serviceCalls = 0;
  const app = await createTestApp({
    getCandidateBestActionTopics: async () => {
      serviceCalls += 1;
      return [topic];
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/candidates/${candidateId}/best-action/topics?asOf=invalid`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "INVALID_INPUT");
  assert.equal(serviceCalls, 0);
});

test("retorna tópicos ranqueados e chama serviço com candidateId e asOf", async (t) => {
  const calls: Array<[string, Date | undefined]> = [];
  const app = await createTestApp({
    getCandidateBestActionTopics: async (...args) => {
      calls.push(args);
      return [topic];
    },
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: topicsUrl });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { count: 1, topics: [topic] });
  assert.equal(calls[0][0], candidateId);
  assert.equal(calls[0][1]?.toISOString(), asOf);
});
