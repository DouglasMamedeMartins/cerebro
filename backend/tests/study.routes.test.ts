import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import type { CreateStudySessionInput } from "../src/domain/study-session/study-session.schema.js";
import cookie from "@fastify/cookie";
import { createRequireCandidate } from "../src/middleware/candidate-auth.js";
import { installApiAuthGuards } from "../src/middleware/api-auth-guards.js";
import { hashToken } from "../src/security/auth-token.js";
import {
  studyRoutes,
  type StudyRouteDependencies,
} from "../src/routes/study.routes.js";

const payload: CreateStudySessionInput = {
  candidateId: "11111111-1111-4111-8111-111111111111",
  topicId: "22222222-2222-4222-8222-222222222222",
  durationMinutes: 45,
  studiedAt: "2026-05-15T12:00:00.000Z",
};

function createTestApp(
  createStudySession: StudyRouteDependencies["createStudySession"],
  authenticatedCandidateId = payload.candidateId,
) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.candidateId = authenticatedCandidateId;
  });
  const getStudyCandidate: StudyRouteDependencies["getStudyCandidate"] = async (
    candidateId,
  ) => ({ id: candidateId, isActive: true });
  const getTopicCoverage: StudyRouteDependencies["getTopicCoverage"] = async () => ({
    totalMinutes: 0,
    lastStudiedAt: null,
    daysSinceStudy: null,
    factor: 100,
  });

  return app
    .register(studyRoutes, {
      createStudySession,
      getStudySessionHistory: async () => ({ sessions: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
      getStudyStreak: async () => ({ currentStreak: 0, longestStreak: 0, totalStudyDays: 0, lastStudyDate: null, asOfDate: "2026-11-12" }),
      getStudyCandidate,
      getTopicCoverage,
    })
    .then(() => app);
}

test("responde 403 quando o candidato está desativado", async (t) => {
  const received: CreateStudySessionInput[] = [];
  const app = await createTestApp(async (data) => {
    received.push(data);
    throw new Error("CANDIDATE_INACTIVE");
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/study-sessions",
    payload,
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "CANDIDATE_INACTIVE" });
  assert.deepEqual(received, [payload]);
});

test("responde 404 quando o candidato não existe", async (t) => {
  const received: CreateStudySessionInput[] = [];
  const app = await createTestApp(async (data) => {
    received.push(data);
    throw new Error("CANDIDATE_NOT_FOUND");
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/study-sessions",
    payload,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "CANDIDATE_NOT_FOUND" });
  assert.deepEqual(received, [payload]);
});

test("responde 201 com a sessão criada e envia dados validados ao serviço", async (t) => {
  const received: CreateStudySessionInput[] = [];
  const session = {
    id: "33333333-3333-4333-8333-333333333333",
    candidateId: payload.candidateId,
    topicId: payload.topicId,
    durationMinutes: payload.durationMinutes,
    studyPlanItemId: null,
    studiedAt: new Date(payload.studiedAt!),
  };
  const app = await createTestApp(async (data) => {
    received.push(data);
    return { session, replayed: false };
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/study-sessions",
    payload,
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    ...session,
    studiedAt: payload.studiedAt,
  });
  assert.deepEqual(received, [payload]);
});

test("associa uma sessão ao item planejado informado", async (t) => {
  const input = { ...payload, studyPlanItemId: "44444444-4444-4444-8444-444444444444" };
  let received: CreateStudySessionInput | undefined;
  const app = await createTestApp(async (data) => {
    received = data;
    return { session: {
      id: "55555555-5555-4555-8555-555555555555",
      ...data,
      studiedAt: new Date(data.studiedAt!),
    }, replayed: false };
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/study-sessions", payload: input });
  assert.equal(response.statusCode, 201);
  assert.equal(received?.studyPlanItemId, input.studyPlanItemId);
  assert.equal(response.json().studyPlanItemId, input.studyPlanItemId);
});

test("usa a identidade autenticada como candidateId ao chamar o serviço", async (t) => {
  let received: CreateStudySessionInput | undefined;
  const app = await createTestApp(async (data) => {
    received = data;
    return { session: { id: "55555555-5555-4555-8555-555555555555", ...data, studiedAt: new Date() }, replayed: false };
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/study-sessions",
    payload: { ...payload, candidateId: "99999999-9999-4999-8999-999999999999" },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(received?.candidateId, payload.candidateId);
});

test("mapeia item inexistente ou tópico incompatível sem expor proprietário", async (t) => {
  const missingApp = await createTestApp(async () => { throw new Error("STUDY_PLAN_ITEM_NOT_FOUND"); });
  const mismatchApp = await createTestApp(async () => { throw new Error("STUDY_PLAN_ITEM_TOPIC_MISMATCH"); });
  t.after(async () => { await missingApp.close(); await mismatchApp.close(); });

  const input = { ...payload, studyPlanItemId: "44444444-4444-4444-8444-444444444444" };
  const missing = await missingApp.inject({ method: "POST", url: "/api/study-sessions", payload: input });
  const mismatch = await mismatchApp.inject({ method: "POST", url: "/api/study-sessions", payload: input });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: "STUDY_PLAN_ITEM_NOT_FOUND" });
  assert.equal(mismatch.statusCode, 400);
  assert.deepEqual(mismatch.json(), { error: "STUDY_PLAN_ITEM_TOPIC_MISMATCH" });
});

test("POST /api/study-sessions exige sessão autenticada", async (t) => {
  const app = Fastify();
  const candidateId = payload.candidateId;
  void app.register(cookie);
  installApiAuthGuards(app, createRequireCandidate({
    async resolveSession(tokenHash) {
      return tokenHash === hashToken("valid-test-session")
        ? { candidateId, sessionId: "test-session" }
        : undefined;
    },
  }), []);
  void app.register(studyRoutes, {
    createStudySession: async () => ({ session: {}, replayed: false }),
    getStudyCandidate: async () => ({ id: candidateId, isActive: true }),
    getTopicCoverage: async () => ({}),
    getStudySessionHistory: async () => ({ sessions: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    getStudyStreak: async () => ({ currentStreak: 0, longestStreak: 0, totalStudyDays: 0, lastStudyDate: null, asOfDate: "2026-11-12" }),
  });
  await app.ready();
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/study-sessions", payload });
  assert.equal(response.statusCode, 401);
});

test("valida Idempotency-Key e retorna 200 para uma repetiÃ§Ã£o idempotente", async (t) => {
  const idempotencyKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const captured: Array<{ data: CreateStudySessionInput; key?: string }> = [];
  const app = await createTestApp(async (data, key) => {
    captured.push({ data, key });
    return { session: { id: "33333333-3333-4333-8333-333333333333", ...data }, replayed: true };
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/study-sessions",
    headers: { "Idempotency-Key": idempotencyKey },
    payload,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(captured[0]?.key, idempotencyKey);
  assert.equal(captured[0]?.data.candidateId, payload.candidateId);
});

test("rejeita chave de idempotÃªncia que nÃ£o seja UUID", async (t) => {
  let calls = 0;
  const app = await createTestApp(async () => {
    calls += 1;
    return { session: {}, replayed: false };
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/study-sessions",
    headers: { "Idempotency-Key": "not-a-uuid" },
    payload,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "INVALID_INPUT");
  assert.equal(calls, 0);
});

test("mapeia conflito de chave idempotente para HTTP 409", async (t) => {
  const app = await createTestApp(async () => {
    throw new Error("STUDY_SESSION_IDEMPOTENCY_CONFLICT");
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/study-sessions",
    headers: { "Idempotency-Key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    payload,
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { error: "STUDY_SESSION_IDEMPOTENCY_CONFLICT" });
});
