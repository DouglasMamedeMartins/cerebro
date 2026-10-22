import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import {
  performanceRoutes,
  type PerformanceRouteDependencies,
} from "../src/routes/performance.routes.js";
import type { TopicPerformance } from "../src/domain/performance/performance.types.js";

const topicId = "22222222-2222-4222-8222-222222222222";
const candidateId = "11111111-1111-4111-8111-111111111111";

const performance: TopicPerformance = {
  topicId,
  attempts: 2,
  correctAnswers: 1,
  incorrectAnswers: 1,
  accuracy: 50,
  recentAccuracy: 50,
  trend: "stable",
  averageResponseTimeSeconds: 31.5,
  averageConfidence: 70,
  reliability: "very_low",
  mastery: 50,
  masteryStatus: "learning",
};

async function createTestApp(
  overrides: Partial<PerformanceRouteDependencies> = {},
) {
  const app = Fastify();
  const dependencies: PerformanceRouteDependencies = {
    getCandidateStatus: async (id) => ({ id, isActive: true }),
    getTopicPerformance: async () => performance,
    ...overrides,
  };

  await app.register(performanceRoutes, dependencies);
  return app;
}

test("retorna 400 para topicId inválido sem consultar candidato ou desempenho", async (t) => {
  let candidateLookups = 0;
  let performanceCalls = 0;
  const app = await createTestApp({
    getCandidateStatus: async () => {
      candidateLookups += 1;
      return { id: candidateId, isActive: true };
    },
    getTopicPerformance: async () => {
      performanceCalls += 1;
      return performance;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/performance/topics/not-a-uuid?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "Parâmetros inválidos");
  assert.ok(response.json().details.fieldErrors.topicId);
  assert.equal(candidateLookups, 0);
  assert.equal(performanceCalls, 0);
});

test("retorna 400 para candidateId inválido sem consultar candidato ou desempenho", async (t) => {
  let candidateLookups = 0;
  let performanceCalls = 0;
  const app = await createTestApp({
    getCandidateStatus: async () => {
      candidateLookups += 1;
      return { id: candidateId, isActive: true };
    },
    getTopicPerformance: async () => {
      performanceCalls += 1;
      return performance;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/performance/topics/${topicId}?candidateId=not-a-uuid`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "Query inválida");
  assert.ok(response.json().details.fieldErrors.candidateId);
  assert.equal(candidateLookups, 0);
  assert.equal(performanceCalls, 0);
});

test("retorna 404 para candidato inexistente sem consultar desempenho", async (t) => {
  let performanceCalls = 0;
  const candidateLookups: string[] = [];
  const app = await createTestApp({
    getCandidateStatus: async (id) => {
      candidateLookups.push(id);
      return undefined;
    },
    getTopicPerformance: async () => {
      performanceCalls += 1;
      return performance;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/performance/topics/${topicId}?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "CANDIDATE_NOT_FOUND" });
  assert.deepEqual(candidateLookups, [candidateId]);
  assert.equal(performanceCalls, 0);
});

test("retorna 403 para candidato inativo sem consultar desempenho", async (t) => {
  let performanceCalls = 0;
  const candidateLookups: string[] = [];
  const app = await createTestApp({
    getCandidateStatus: async (id) => {
      candidateLookups.push(id);
      return { id, isActive: false };
    },
    getTopicPerformance: async () => {
      performanceCalls += 1;
      return performance;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/performance/topics/${topicId}?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "CANDIDATE_INACTIVE" });
  assert.deepEqual(candidateLookups, [candidateId]);
  assert.equal(performanceCalls, 0);
});

test("retorna TopicPerformance e consulta o serviço com os IDs validados", async (t) => {
  const performanceCalls: Array<[string, string]> = [];
  const app = await createTestApp({
    getTopicPerformance: async (...ids) => {
      performanceCalls.push(ids);
      return performance;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/performance/topics/${topicId}?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), performance);
  assert.deepEqual(performanceCalls, [[topicId, candidateId]]);
});

test("retorna 500 com o corpo atual quando o serviço falha", async (t) => {
  const app = await createTestApp({
    getTopicPerformance: async () => {
      throw new Error("unexpected service failure");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/performance/topics/${topicId}?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: "Erro interno ao calcular desempenho",
  });
});
