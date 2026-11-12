import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import type { CreateStudySessionInput } from "../src/domain/study-session/study-session.schema.js";
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
) {
  const app = Fastify();
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
    studiedAt: new Date(payload.studiedAt!),
  };
  const app = await createTestApp(async (data) => {
    received.push(data);
    return session;
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
