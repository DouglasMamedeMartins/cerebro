import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";

import { createRequireCandidate } from "../src/middleware/candidate-auth.js";
import { installApiAuthGuards } from "../src/middleware/api-auth-guards.js";
import { studyRoutes } from "../src/routes/study.routes.js";
import type { StudySessionHistoryFilters } from "../src/services/study-session.service.js";
import { hashToken } from "../src/security/auth-token.js";

const candidateAId = "11111111-1111-4111-8111-111111111111";
const candidateBId = "22222222-2222-4222-8222-222222222222";
const tokenA = "history-token-a";
const tokenB = "history-token-b";

type HistorySession = {
  id: string;
  studiedAt: Date;
  localStudyDate: string;
  durationMinutes: number;
  topicId: string;
  topicName: string | null;
  subjectName: string | null;
};

const sessionA: HistorySession = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  studiedAt: new Date("2026-06-02T02:30:00.000Z"),
  localStudyDate: "2026-06-01",
  durationMinutes: 35,
  topicId: "33333333-3333-4333-8333-333333333333",
  topicName: "Direitos fundamentais",
  subjectName: "Direito Constitucional",
};

const sessionB: HistorySession = {
  ...sessionA,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  topicName: "Teoria do crime",
  subjectName: "Direito Penal",
};

function createTestApp() {
  const app = Fastify();
  const candidateByTokenHash = new Map([
    [hashToken(tokenA), candidateAId],
    [hashToken(tokenB), candidateBId],
  ]);
  const calls: Array<{ candidateId: string; filters: StudySessionHistoryFilters }> = [];
  const store = {
    async resolveSession(tokenHash: string) {
      const candidateId = candidateByTokenHash.get(tokenHash);
      return candidateId ? { candidateId, sessionId: `session-${candidateId}` } : undefined;
    },
  };

  void app.register(cookie);
  installApiAuthGuards(app, createRequireCandidate(store), []);
  void app.register(studyRoutes, {
    createStudySession: async () => ({}),
    getStudyCandidate: async (candidateId) => ({ id: candidateId, isActive: true }),
    getTopicCoverage: async () => ({}),
    getStudySessionHistory: async (candidateId, filters) => {
      calls.push({ candidateId, filters });
      const sessions = candidateId === candidateAId ? [sessionA] : [sessionB];
      if (filters.from && sessions.some((session) => session.localStudyDate < filters.from!)) return emptyResult(filters);
      if (filters.to && sessions.some((session) => session.localStudyDate > filters.to!)) return emptyResult(filters);
      const offset = (filters.page - 1) * filters.limit;
      const pageSessions = sessions.slice(offset, offset + filters.limit);
      return {
        sessions: pageSessions,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total: sessions.length,
          totalPages: Math.ceil(sessions.length / filters.limit),
        },
      };
    },
    getStudyStreak: async () => ({ currentStreak: 0, longestStreak: 0, totalStudyDays: 0, lastStudyDate: null, asOfDate: "2026-11-12" }),
  });

  return app.ready().then(() => ({ app, calls }));
}

function emptyResult(filters: StudySessionHistoryFilters) {
  return {
    sessions: [],
    pagination: { page: filters.page, limit: filters.limit, total: 0, totalPages: 0 },
  };
}

test("histórico autenticado retorna sessões e paginação sem expor candidateId", async (t) => {
  const { app } = await createTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/study-sessions/history",
    headers: { cookie: `candidate_session=${tokenA}` },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    sessions: [{ ...sessionA, studiedAt: sessionA.studiedAt.toISOString() }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  });
});

test("cada sessão recebe exclusivamente o histórico do proprietário autenticado", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  const responseA = await app.inject({ method: "GET", url: "/api/study-sessions/history", headers: { cookie: `candidate_session=${tokenA}` } });
  const responseB = await app.inject({ method: "GET", url: "/api/study-sessions/history", headers: { cookie: `candidate_session=${tokenB}` } });

  assert.equal(responseA.json().sessions[0].topicName, "Direitos fundamentais");
  assert.equal(responseB.json().sessions[0].topicName, "Teoria do crime");
  assert.deepEqual(calls.map((call) => call.candidateId), [candidateAId, candidateBId]);
});

test("filtros from/to são validados e encaminhados como dias locais", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/study-sessions/history?from=2026-06-01&to=2026-06-01",
    headers: { cookie: `candidate_session=${tokenA}` },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls[0].filters, { from: "2026-06-01", to: "2026-06-01", page: 1, limit: 20 });
  assert.equal(response.json().sessions[0].localStudyDate, "2026-06-01");
});

test("paginação funciona e limite acima de 100 é rejeitado", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  const pageResponse = await app.inject({
    method: "GET",
    url: "/api/study-sessions/history?page=2&limit=1",
    headers: { cookie: `candidate_session=${tokenA}` },
  });
  assert.equal(pageResponse.statusCode, 200);
  assert.deepEqual(pageResponse.json().pagination, { page: 2, limit: 1, total: 1, totalPages: 1 });
  assert.equal(pageResponse.json().sessions.length, 0);

  const callsBeforeInvalidLimit = calls.length;
  const invalidLimitResponse = await app.inject({
    method: "GET",
    url: "/api/study-sessions/history?limit=101",
    headers: { cookie: `candidate_session=${tokenA}` },
  });
  assert.equal(invalidLimitResponse.statusCode, 400);
  assert.equal(calls.length, callsBeforeInvalidLimit);
});

test("retorna resultado vazio quando o candidato não tem sessões", async (t) => {
  const { app } = await createTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/study-sessions/history?from=2026-07-01",
    headers: { cookie: `candidate_session=${tokenA}` },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { sessions: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
});

test("datas inválidas, intervalo invertido e candidateId selecionável são rejeitados", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  for (const [query, expectedStatus] of [
    ["from=2026-02-30", 400],
    ["from=2026-06-02&to=2026-06-01", 400],
    [`candidateId=${candidateAId}`, 400],
    [`candidateId=${candidateBId}`, 403],
  ] as const) {
    const response = await app.inject({
      method: "GET",
      url: `/api/study-sessions/history?${query}`,
      headers: { cookie: `candidate_session=${tokenA}` },
    });
    assert.equal(response.statusCode, expectedStatus, query);
  }
  assert.equal(calls.length, 0);
});

test("histórico sem autenticação retorna 401", async (t) => {
  const { app, calls } = await createTestApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/study-sessions/history" });

  assert.equal(response.statusCode, 401);
  assert.equal(calls.length, 0);
});
