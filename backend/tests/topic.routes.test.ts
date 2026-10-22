import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import {
  topicRoutes,
  type TopicRouteDependencies,
} from "../src/routes/topic.routes.js";
import type { TopicState } from "../src/domain/topic/topic-state.schema.js";

const topicId = "22222222-2222-4222-8222-222222222222";
const candidateId = "11111111-1111-4111-8111-111111111111";
const asOf = "2026-05-15T12:00:00.000Z";

const state: TopicState = {
  topicId,
  candidateId,
  mastery: 65,
  masteryStatus: "developing",
  reliability: "moderate",
  attempts: 12,
  trend: "stable",
  incorrectAnswers: 4,
  coverageFactor: 40,
  reviewFactor: 15,
  priorityScore: 62,
  priorityLevel: "medium",
  priorityFactors: {
    deficit: 35,
    weight: 50,
    incidence: 20,
    coverage: 40,
    review: 15,
    trend: 50,
    errors: 25,
    urgency: 60,
  },
  evaluationStatus: "evaluated",
};

async function createTestApp(
  overrides: Partial<TopicRouteDependencies> = {},
) {
  const app = Fastify();
  const dependencies: TopicRouteDependencies = {
    getCandidateStatus: async (id) => ({ id, isActive: true }),
    getTopicState: async () => state,
    ...overrides,
  };

  await app.register(topicRoutes, dependencies);
  return app;
}

test("topicId inválido retorna 400 e não chama os serviços", async (t) => {
  let candidateLookups = 0;
  let stateCalls = 0;
  const app = await createTestApp({
    getCandidateStatus: async () => {
      candidateLookups += 1;
      return { id: candidateId, isActive: true };
    },
    getTopicState: async () => {
      stateCalls += 1;
      return state;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/topics/not-a-uuid/state?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "INVALID_INPUT");
  assert.ok(response.json().details.params.fieldErrors.topicId);
  assert.equal(candidateLookups, 0);
  assert.equal(stateCalls, 0);
});

test("candidateId inválido retorna 400 e não chama os serviços", async (t) => {
  let candidateLookups = 0;
  let stateCalls = 0;
  const app = await createTestApp({
    getCandidateStatus: async () => {
      candidateLookups += 1;
      return { id: candidateId, isActive: true };
    },
    getTopicState: async () => {
      stateCalls += 1;
      return state;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/topics/${topicId}/state?candidateId=not-a-uuid`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "INVALID_INPUT");
  assert.ok(response.json().details.query.fieldErrors.candidateId);
  assert.equal(candidateLookups, 0);
  assert.equal(stateCalls, 0);
});

test("asOf inválido retorna 400 e não chama os serviços", async (t) => {
  let candidateLookups = 0;
  let stateCalls = 0;
  const app = await createTestApp({
    getCandidateStatus: async () => {
      candidateLookups += 1;
      return { id: candidateId, isActive: true };
    },
    getTopicState: async () => {
      stateCalls += 1;
      return state;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/topics/${topicId}/state?candidateId=${candidateId}&asOf=invalid`,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "INVALID_INPUT");
  assert.ok(response.json().details.query.fieldErrors.asOf);
  assert.equal(candidateLookups, 0);
  assert.equal(stateCalls, 0);
});

test("candidato inexistente retorna 404 e não chama getTopicState", async (t) => {
  let stateCalls = 0;
  const candidateLookups: string[] = [];
  const app = await createTestApp({
    getCandidateStatus: async (id) => {
      candidateLookups.push(id);
      return undefined;
    },
    getTopicState: async () => {
      stateCalls += 1;
      return state;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/topics/${topicId}/state?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "CANDIDATE_NOT_FOUND" });
  assert.deepEqual(candidateLookups, [candidateId]);
  assert.equal(stateCalls, 0);
});

test("candidato inativo retorna 403 e não chama getTopicState", async (t) => {
  let stateCalls = 0;
  const candidateLookups: string[] = [];
  const app = await createTestApp({
    getCandidateStatus: async (id) => {
      candidateLookups.push(id);
      return { id, isActive: false };
    },
    getTopicState: async () => {
      stateCalls += 1;
      return state;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/topics/${topicId}/state?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "CANDIDATE_INACTIVE" });
  assert.deepEqual(candidateLookups, [candidateId]);
  assert.equal(stateCalls, 0);
});

test("retorna TopicState e encaminha os argumentos sem asOf", async (t) => {
  const stateCalls: Array<[string, string, Date | undefined]> = [];
  const app = await createTestApp({
    getTopicState: async (...args) => {
      stateCalls.push(args);
      return state;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/topics/${topicId}/state?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), state);
  assert.equal(stateCalls.length, 1);
  assert.equal(stateCalls[0][0], candidateId);
  assert.equal(stateCalls[0][1], topicId);
  assert.ok(stateCalls[0][2] instanceof Date);
});

test("encaminha asOf validado como Date", async (t) => {
  const stateCalls: Array<[string, string, Date | undefined]> = [];
  const app = await createTestApp({
    getTopicState: async (...args) => {
      stateCalls.push(args);
      return state;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/topics/${topicId}/state?candidateId=${candidateId}&asOf=${encodeURIComponent(asOf)}`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), state);
  assert.deepEqual(stateCalls, [[candidateId, topicId, new Date(asOf)]]);
});

test("erro inesperado segue o tratamento padrão do Fastify", async (t) => {
  const app = await createTestApp({
    getTopicState: async () => {
      throw new Error("unexpected topic state failure");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/topics/${topicId}/state?candidateId=${candidateId}`,
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    statusCode: 500,
    error: "Internal Server Error",
    message: "unexpected topic state failure",
  });
});
