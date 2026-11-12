import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";

import { createRequireCandidate } from "../src/middleware/candidate-auth.js";
import { installApiAuthGuards } from "../src/middleware/api-auth-guards.js";
import { studyRoutes } from "../src/routes/study.routes.js";
import { calculateStudyStreak, getLocalStudyDate } from "../src/services/study-streak.service.js";
import { hashToken } from "../src/security/auth-token.js";

const candidateAId = "11111111-1111-4111-8111-111111111111";
const candidateBId = "22222222-2222-4222-8222-222222222222";
const candidateErrorId = "33333333-3333-4333-8333-333333333333";
const tokenA = "streak-token-a";
const tokenB = "streak-token-b";
const tokenError = "streak-token-error";
const asOfDate = "2026-11-12";

test("sem registros retorna zero e nenhuma última data", () => {
  assert.deepEqual(calculateStudyStreak([], asOfDate), {
    currentStreak: 0,
    longestStreak: 0,
    totalStudyDays: 0,
    lastStudyDate: null,
    asOfDate,
  });
});

test("um único dia estudado conta como uma sequência", () => {
  assert.deepEqual(calculateStudyStreak([asOfDate], asOfDate), {
    currentStreak: 1,
    longestStreak: 1,
    totalStudyDays: 1,
    lastStudyDate: asOfDate,
    asOfDate,
  });
});

test("dias consecutivos incluindo hoje compõem a sequência atual", () => {
  const result = calculateStudyStreak(["2026-11-10", "2026-11-11", asOfDate], asOfDate);
  assert.equal(result.currentStreak, 3);
  assert.equal(result.longestStreak, 3);
});

test("estudo hoje mantém a sequência ativa", () => {
  assert.equal(calculateStudyStreak(["2026-11-09", "2026-11-12"], asOfDate).currentStreak, 1);
});

test("estudo ontem mantém a sequência ativa quando hoje ainda não há sessão", () => {
  assert.equal(calculateStudyStreak(["2026-11-10", "2026-11-11"], asOfDate).currentStreak, 2);
});

test("último estudo há dois dias ou mais zera apenas a sequência atual", () => {
  const result = calculateStudyStreak(["2026-11-10"], asOfDate);
  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 1);
});

test("várias sessões no mesmo dia contam como um único dia", () => {
  const result = calculateStudyStreak(["2026-11-11", "2026-11-11", "2026-11-12"], asOfDate);
  assert.equal(result.totalStudyDays, 2);
  assert.equal(result.currentStreak, 2);
});

test("lacunas encerram a sequência e o maior trecho histórico é preservado", () => {
  const result = calculateStudyStreak([
    "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-06", "2026-11-07",
  ], "2026-11-07");
  assert.equal(result.currentStreak, 2);
  assert.equal(result.longestStreak, 3);
  assert.equal(result.totalStudyDays, 5);
});

test("datas futuras são excluídas dos totais e da sequência", () => {
  const result = calculateStudyStreak([asOfDate, "2026-11-13", "2026-12-01"], asOfDate);
  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 1);
  assert.equal(result.totalStudyDays, 1);
  assert.equal(result.lastStudyDate, asOfDate);
});

test("converte instantes para o dia de calendário de America/Sao_Paulo", () => {
  assert.equal(getLocalStudyDate(new Date("2026-11-12T02:59:59.000Z")), "2026-11-11");
  assert.equal(getLocalStudyDate(new Date("2026-11-12T03:00:00.000Z")), "2026-11-12");
});

function createTestApp() {
  const app = Fastify();
  const candidateByTokenHash = new Map([
    [hashToken(tokenA), candidateAId],
    [hashToken(tokenB), candidateBId],
    [hashToken(tokenError), candidateErrorId],
  ]);
  const calls: string[] = [];
  const store = {
    async resolveSession(tokenHash: string) {
      const candidateId = candidateByTokenHash.get(tokenHash);
      return candidateId ? { candidateId, sessionId: `session-${candidateId}` } : undefined;
    },
  };

  void app.register(cookie);
  installApiAuthGuards(app, createRequireCandidate(store), []);
  void app.register(studyRoutes, {
    createStudySession: async () => ({ session: {}, replayed: false }),
    getStudyCandidate: async (candidateId) => ({ id: candidateId, isActive: true }),
    getTopicCoverage: async () => ({}),
    getStudySessionHistory: async (_candidateId, filters) => ({
      sessions: [],
      pagination: { page: filters.page, limit: filters.limit, total: 0, totalPages: 0 },
    }),
    getStudyStreak: async (candidateId) => {
      calls.push(candidateId);
      if (candidateId === candidateErrorId) throw new Error("TEST_FAILURE");
      return candidateId === candidateAId
        ? calculateStudyStreak(["2026-11-11", asOfDate], asOfDate)
        : calculateStudyStreak(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", asOfDate], asOfDate);
    },
  });

  return app.ready().then(() => ({ app, calls }));
}

test("rota exige sessão e vincula a consulta ao candidato autenticado", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  const unauthenticated = await app.inject({ method: "GET", url: "/api/study-sessions/streak" });
  assert.equal(unauthenticated.statusCode, 401);

  const authenticated = await app.inject({
    method: "GET",
    url: "/api/study-sessions/streak",
    headers: { cookie: `candidate_session=${tokenA}` },
  });
  assert.equal(authenticated.statusCode, 200);
  assert.equal(authenticated.json().currentStreak, 2);
  assert.deepEqual(calls, [candidateAId]);
});

test("Douglas e Kalleb recebem sequências independentes conforme suas próprias sessões", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  const responseA = await app.inject({ method: "GET", url: "/api/study-sessions/streak", headers: { cookie: `candidate_session=${tokenA}` } });
  const responseB = await app.inject({ method: "GET", url: "/api/study-sessions/streak", headers: { cookie: `candidate_session=${tokenB}` } });

  assert.equal(responseA.json().currentStreak, 2);
  assert.equal(responseB.json().currentStreak, 5);
  assert.deepEqual(calls, [candidateAId, candidateBId]);
});

test("rota não aceita candidateId do cliente e converte falha do serviço em erro HTTP", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  const suppliedId = await app.inject({
    method: "GET",
    url: `/api/study-sessions/streak?candidateId=${candidateAId}`,
    headers: { cookie: `candidate_session=${tokenA}` },
  });
  assert.equal(suppliedId.statusCode, 400);
  assert.deepEqual(calls, []);

  const serviceFailure = await app.inject({
    method: "GET",
    url: "/api/study-sessions/streak",
    headers: { cookie: `candidate_session=${tokenError}` },
  });
  assert.equal(serviceFailure.statusCode, 500);
  assert.deepEqual(calls, [candidateErrorId]);
});
