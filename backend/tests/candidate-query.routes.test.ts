import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import type { candidates } from "../src/db/schema.js";
import {
  candidateRoutes,
  type CandidateRouteDependencies,
} from "../src/routes/candidate.routes.js";

const adminKey = "candidate-query-test-key";
const candidateId = "11111111-1111-4111-8111-111111111111";
const inactiveCandidateId = "22222222-2222-4222-8222-222222222222";
const editalVersionId = "33333333-3333-4333-8333-333333333333";
type Candidate = typeof candidates.$inferSelect;

const candidate: Candidate = {
  id: candidateId,
  name: "Candidato de Teste",
  email: "candidate@example.test",
  isActive: true,
  editalVersionId,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const inactiveCandidate: Candidate = {
  ...candidate,
  id: inactiveCandidateId,
  name: "Candidato Inativo",
  email: "inactive@example.test",
  isActive: false,
};

async function withAdminApiKey<T>(
  value: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const previousValue = process.env.ADMIN_API_KEY;
  if (value === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = value;

  try {
    return await callback();
  } finally {
    if (previousValue === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = previousValue;
  }
}

async function createApp(
  overrides: Partial<CandidateRouteDependencies> = {},
) {
  const app = Fastify();
  const dependencies: CandidateRouteDependencies = {
    createCandidate: async () => candidate,
    deactivateCandidate: async () => inactiveCandidate,
    getCandidateById: async () => candidate,
    getCandidates: async () => [candidate],
    getPublicCandidates: async () => [{ id: candidate.id, name: candidate.name }],
    updateCandidate: async () => candidate,
    ...overrides,
  };
  await app.register(candidateRoutes, dependencies);
  return app;
}

test("GET /api/candidates retorna somente id e name de candidatos ativos", async (t) => {
  let publicListCalls = 0;
  const app = await createApp({
    getPublicCandidates: async () => {
      publicListCalls += 1;
      // A implementação real filtra is_active=true e projeta apenas id/name.
      return [{ id: candidate.id, name: candidate.name }];
    },
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/candidates" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), [{ id: candidate.id, name: candidate.name }]);
  assert.equal(publicListCalls, 1);

  const serialized = JSON.stringify(response.json());
  for (const privateField of [
    "email",
    "isActive",
    "editalVersionId",
    "createdAt",
    "updatedAt",
  ]) {
    assert.equal(serialized.includes(privateField), false);
  }
  assert.equal(serialized.includes(inactiveCandidate.email), false);
});

test("GET /api/candidates/:candidateId exige chave administrativa sem consultar o serviço", async (t) => {
  let detailCalls = 0;
  const app = await createApp({
    getCandidateById: async () => {
      detailCalls += 1;
      return candidate;
    },
  });
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/candidates/${candidateId}`,
    });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "Acesso administrativo não autorizado",
    });
    assert.equal(detailCalls, 0);
  });
});

test("GET /api/admin/candidates bloqueia chave ausente/incorreta e retorna dados completos com chave válida", async (t) => {
  let listCalls = 0;
  const app = await createApp({
    getCandidates: async () => {
      listCalls += 1;
      return [candidate, inactiveCandidate];
    },
  });
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const missingKeyResponse = await app.inject({
      method: "GET",
      url: "/api/admin/candidates",
    });
    assert.equal(missingKeyResponse.statusCode, 401);
    const wrongKeyResponse = await app.inject({
      method: "GET",
      url: "/api/admin/candidates",
      headers: { "x-admin-key": "incorrect-test-key" },
    });
    assert.equal(wrongKeyResponse.statusCode, 401);
    assert.equal(listCalls, 0);

    const authorizedResponse = await app.inject({
      method: "GET",
      url: "/api/admin/candidates",
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(authorizedResponse.statusCode, 200);
    assert.deepEqual(authorizedResponse.json(), [
      {
        ...candidate,
        createdAt: candidate.createdAt.toISOString(),
        updatedAt: candidate.updatedAt.toISOString(),
      },
      {
        ...inactiveCandidate,
        createdAt: inactiveCandidate.createdAt.toISOString(),
        updatedAt: inactiveCandidate.updatedAt.toISOString(),
      },
    ]);
    assert.equal(listCalls, 1);
  });
});

test("GET /api/admin/candidates/:candidateId valida UUID, autoriza e trata candidato ausente", async (t) => {
  const receivedIds: string[] = [];
  const app = await createApp({
    getCandidateById: async (id) => {
      receivedIds.push(id);
      return id === candidateId ? candidate : null;
    },
  });
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const unauthorized = await app.inject({
      method: "GET",
      url: `/api/admin/candidates/${candidateId}`,
    });
    assert.equal(unauthorized.statusCode, 401);
    assert.deepEqual(receivedIds, []);

    const wrongKey = await app.inject({
      method: "GET",
      url: `/api/admin/candidates/${candidateId}`,
      headers: { "x-admin-key": "incorrect-test-key" },
    });
    assert.equal(wrongKey.statusCode, 401);
    assert.deepEqual(receivedIds, []);

    const invalidId = await app.inject({
      method: "GET",
      url: "/api/admin/candidates/not-a-uuid",
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(invalidId.statusCode, 400);
    assert.deepEqual(receivedIds, []);

    const notFound = await app.inject({
      method: "GET",
      url: `/api/admin/candidates/${inactiveCandidateId}`,
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(notFound.statusCode, 404);
    assert.deepEqual(notFound.json(), { error: "Candidato não encontrado" });
    assert.deepEqual(receivedIds, [inactiveCandidateId]);

    const missing = await app.inject({
      method: "GET",
      url: "/api/admin/candidates/44444444-4444-4444-8444-444444444444",
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.json(), { error: "Candidato não encontrado" });
    assert.deepEqual(receivedIds, [
      inactiveCandidateId,
      "44444444-4444-4444-8444-444444444444",
    ]);

    const success = await app.inject({
      method: "GET",
      url: `/api/admin/candidates/${candidateId}`,
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(success.statusCode, 200);
    assert.deepEqual(success.json(), {
      ...candidate,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
    });
    assert.deepEqual(receivedIds, [
      inactiveCandidateId,
      "44444444-4444-4444-8444-444444444444",
      candidateId,
    ]);
  });
});
