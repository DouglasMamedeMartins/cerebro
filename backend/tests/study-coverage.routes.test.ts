import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import {
  studyRoutes,
  type StudyRouteDependencies,
} from "../src/routes/study.routes.js";

const candidateId = "11111111-1111-4111-8111-111111111111";
const topicId = "22222222-2222-4222-8222-222222222222";
const asOf = "2026-05-15T12:00:00.000Z";
const url = `/api/study-sessions/${candidateId}/${topicId}/coverage?asOf=${encodeURIComponent(asOf)}`;

async function createTestApp(
  candidate: { id: string; isActive: boolean } | undefined,
  getTopicCoverage: StudyRouteDependencies["getTopicCoverage"],
) {
  const app = Fastify();
  const createStudySession: StudyRouteDependencies["createStudySession"] = async () =>
    ({ session: {}, replayed: false });
  const getStudyCandidate: StudyRouteDependencies["getStudyCandidate"] = async (
    requestedCandidateId,
  ) => (candidate ? { ...candidate, id: requestedCandidateId } : undefined);

  await app.register(studyRoutes, {
    createStudySession,
    getStudySessionHistory: async () => ({ sessions: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    getStudyStreak: async () => ({ currentStreak: 0, longestStreak: 0, totalStudyDays: 0, lastStudyDate: null, asOfDate: "2026-11-12" }),
    getStudyCandidate,
    getTopicCoverage,
  });
  return app;
}

test("retorna 403 para candidato inativo sem consultar a cobertura", async (t) => {
  let coverageCalls = 0;
  const app = await createTestApp(
    { id: candidateId, isActive: false },
    async () => {
      coverageCalls += 1;
      return {};
    },
  );
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "CANDIDATE_INACTIVE" });
  assert.equal(coverageCalls, 0);
});

test("retorna 404 para candidato inexistente sem consultar a cobertura", async (t) => {
  let coverageCalls = 0;
  const app = await createTestApp(undefined, async () => {
    coverageCalls += 1;
    return {};
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "CANDIDATE_NOT_FOUND" });
  assert.equal(coverageCalls, 0);
});

test("retorna cobertura para candidato ativo com parâmetros validados", async (t) => {
  const coverageCalls: Array<[string, string, Date | undefined]> = [];
  const lastStudiedAt = new Date("2026-05-11T10:30:00.000Z");
  const coverage = {
    totalMinutes: 135,
    lastStudiedAt,
    daysSinceStudy: 4,
    factor: 15,
  };
  const app = await createTestApp(
    { id: candidateId, isActive: true },
    async (...args) => {
      coverageCalls.push(args);
      return coverage;
    },
  );
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ...coverage,
    lastStudiedAt: lastStudiedAt.toISOString(),
  });
  assert.equal(coverageCalls.length, 1);
  assert.equal(coverageCalls[0][0], candidateId);
  assert.equal(coverageCalls[0][1], topicId);
  assert.equal(coverageCalls[0][2]?.toISOString(), asOf);
});
