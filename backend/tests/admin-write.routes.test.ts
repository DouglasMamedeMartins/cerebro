import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import type { candidates } from "../src/db/schema.js";
import type { CreateCandidateInput, UpdateCandidateInput } from "../src/domain/candidate/candidate.schema.js";
import type { CreateEditalInput } from "../src/domain/edital/edital.schema.js";
import type { CreateSubjectInput } from "../src/domain/subject/subject.schema.js";
import {
  candidateRoutes,
  type CandidateRouteDependencies,
} from "../src/routes/candidate.routes.js";
import {
  editalRoutes,
  type EditalRouteDependencies,
} from "../src/routes/edital.routes.js";
import {
  subjectRoutes,
  type SubjectRouteDependencies,
} from "../src/routes/subject.routes.js";

const adminKey = "admin-write-test-key";
const candidateId = "11111111-1111-4111-8111-111111111111";
const editalVersionId = "22222222-2222-4222-8222-222222222222";
const subjectId = "33333333-3333-4333-8333-333333333333";
type Candidate = typeof candidates.$inferSelect;

const candidate: Candidate = {
  id: candidateId,
  name: "Candidata Teste",
  email: "candidate@example.test",
  isActive: true,
  editalVersionId,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const createCandidateInput: CreateCandidateInput = {
  name: candidate.name,
  email: candidate.email,
  editalVersionId,
};

const updateCandidateInput: UpdateCandidateInput = {
  name: "Nome Atualizado",
};

const createEditalInput: CreateEditalInput = {
  title: "Edital PMDF de Teste",
  version: 1,
  isOfficial: false,
};

const createSubjectInput: CreateSubjectInput = {
  editalVersionId,
  name: "Direito Administrativo",
};

const edital = {
  id: editalVersionId,
  title: createEditalInput.title,
  version: createEditalInput.version,
  examDate: null,
  publishedAt: null,
  sourceUrl: null,
  isOfficial: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const subject = {
  id: subjectId,
  editalVersionId,
  name: createSubjectInput.name,
  description: null,
  weight: null,
  position: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

async function withAdminApiKey<T>(callback: () => Promise<T>): Promise<T> {
  const previousValue = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = adminKey;

  try {
    return await callback();
  } finally {
    if (previousValue === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = previousValue;
    }
  }
}

async function createCandidateApp(
  overrides: Partial<CandidateRouteDependencies> = {},
) {
  const app = Fastify();
  const dependencies: CandidateRouteDependencies = {
    createCandidate: async () => candidate,
    deactivateCandidate: async () => ({ ...candidate, isActive: false }),
    getCandidateById: async () => candidate,
    getCandidates: async () => [candidate],
    getPublicCandidates: async () => [{ id: candidate.id, name: candidate.name }],
    updateCandidate: async () => ({ ...candidate, name: "Nome Atualizado" }),
    ...overrides,
  };
  await app.register(candidateRoutes, dependencies);
  return app;
}

async function createEditalApp(
  overrides: Partial<EditalRouteDependencies> = {},
) {
  const app = Fastify();
  await app.register(editalRoutes, {
    createEdital: async () => edital,
    ...overrides,
  });
  return app;
}

async function createSubjectApp(
  overrides: Partial<SubjectRouteDependencies> = {},
) {
  const app = Fastify();
  await app.register(subjectRoutes, {
    createSubject: async () => subject,
    ...overrides,
  });
  return app;
}

async function assertUnauthenticatedRequestsAreBlocked(
  app: ReturnType<typeof Fastify>,
  request: { method: "POST" | "PATCH" | "DELETE"; url: string; payload?: unknown },
  serviceCalls: () => number,
) {
  await withAdminApiKey(async () => {
    const withoutKey = await app.inject(request);
    assert.equal(withoutKey.statusCode, 401);
    assert.deepEqual(withoutKey.json(), {
      error: "Acesso administrativo não autorizado",
    });

    const wrongKey = await app.inject({
      ...request,
      headers: { "x-admin-key": "incorrect-test-key" },
    });
    assert.equal(wrongKey.statusCode, 401);
    assert.deepEqual(wrongKey.json(), {
      error: "Acesso administrativo não autorizado",
    });
    assert.equal(serviceCalls(), 0);
  });
}

test("POST /api/candidates bloqueia requisições sem chave e chama o serviço com chave válida", async (t) => {
  const received: CreateCandidateInput[] = [];
  const app = await createCandidateApp({
    createCandidate: async (data) => {
      received.push(data);
      return candidate;
    },
  });
  t.after(() => app.close());

  const request = {
    method: "POST" as const,
    url: "/api/candidates",
    payload: createCandidateInput,
  };
  await assertUnauthenticatedRequestsAreBlocked(app, request, () => received.length);

  await withAdminApiKey(async () => {
    const response = await app.inject({
      ...request,
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(received, [createCandidateInput]);
  });
});

test("PATCH /api/candidates/:candidateId bloqueia requisições sem chave e encaminha os dados autorizados", async (t) => {
  const received: Array<[string, UpdateCandidateInput]> = [];
  const app = await createCandidateApp({
    updateCandidate: async (id, data) => {
      received.push([id, data]);
      return { ...candidate, ...data };
    },
  });
  t.after(() => app.close());

  const request = {
    method: "PATCH" as const,
    url: `/api/candidates/${candidateId}`,
    payload: updateCandidateInput,
  };
  await assertUnauthenticatedRequestsAreBlocked(app, request, () => received.length);

  await withAdminApiKey(async () => {
    const response = await app.inject({
      ...request,
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(received, [[candidateId, updateCandidateInput]]);
  });
});

test("DELETE /api/candidates/:candidateId bloqueia requisições sem chave e encaminha o ID autorizado", async (t) => {
  const received: string[] = [];
  const app = await createCandidateApp({
    deactivateCandidate: async (id) => {
      received.push(id);
      return { ...candidate, isActive: false };
    },
  });
  t.after(() => app.close());

  const request = {
    method: "DELETE" as const,
    url: `/api/candidates/${candidateId}`,
  };
  await assertUnauthenticatedRequestsAreBlocked(app, request, () => received.length);

  await withAdminApiKey(async () => {
    const response = await app.inject({
      ...request,
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(received, [candidateId]);
  });
});

test("POST /api/edital-versions bloqueia requisições sem chave e chama o serviço autorizado", async (t) => {
  const received: CreateEditalInput[] = [];
  const app = await createEditalApp({
    createEdital: async (data) => {
      received.push(data);
      return edital;
    },
  });
  t.after(() => app.close());

  const request = {
    method: "POST" as const,
    url: "/api/edital-versions",
    payload: createEditalInput,
  };
  await assertUnauthenticatedRequestsAreBlocked(app, request, () => received.length);

  await withAdminApiKey(async () => {
    const response = await app.inject({
      ...request,
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(received, [createEditalInput]);
  });
});

test("POST /api/subjects bloqueia requisições sem chave e chama o serviço autorizado", async (t) => {
  const received: CreateSubjectInput[] = [];
  const app = await createSubjectApp({
    createSubject: async (data) => {
      received.push(data);
      return subject;
    },
  });
  t.after(() => app.close());

  const request = {
    method: "POST" as const,
    url: "/api/subjects",
    payload: createSubjectInput,
  };
  await assertUnauthenticatedRequestsAreBlocked(app, request, () => received.length);

  await withAdminApiKey(async () => {
    const response = await app.inject({
      ...request,
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(received, [createSubjectInput]);
  });
});

test("lista de candidatos permanece pública e detalhe legado exige chave administrativa", async (t) => {
  const calls: string[] = [];
  const serializedCandidate = {
    ...candidate,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
  const app = await createCandidateApp({
    getPublicCandidates: async () => {
      calls.push("list");
      return [{ id: candidate.id, name: candidate.name }];
    },
    getCandidateById: async (id) => {
      calls.push(id);
      return candidate;
    },
  });
  t.after(() => app.close());

  await withAdminApiKey(async () => {
    const listResponse = await app.inject({ method: "GET", url: "/api/candidates" });
    const unauthorizedDetailResponse = await app.inject({
      method: "GET",
      url: `/api/candidates/${candidateId}`,
    });

    assert.equal(listResponse.statusCode, 401);
    assert.equal(listResponse.json().error, "Acesso administrativo não autorizado");
    assert.equal(unauthorizedDetailResponse.statusCode, 401);
    assert.deepEqual(unauthorizedDetailResponse.json(), {
      error: "Acesso administrativo não autorizado",
    });

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/candidates/${candidateId}`,
      headers: { "x-admin-key": adminKey },
    });
    assert.equal(detailResponse.statusCode, 200);
    assert.deepEqual(detailResponse.json(), serializedCandidate);
    const authorizedListResponse = await app.inject({ method: "GET", url: "/api/candidates", headers: { "x-admin-key": adminKey } });
    assert.equal(authorizedListResponse.statusCode, 200);
    assert.deepEqual(authorizedListResponse.json(), [{ id: candidate.id, name: candidate.name }]);
    assert.deepEqual(calls, [candidateId, "list"]);
  });
});
