import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import Fastify from "fastify";

import { requireAdmin } from "../src/middleware/admin-auth.js";

const adminKey = "test-only-admin-key";
const questionId = "33333333-3333-4333-8333-333333333333";
const topicId = "22222222-2222-4222-8222-222222222222";

type QuestionServiceFakes = {
  createQuestion: (data: unknown) => Promise<unknown>;
  updateQuestion: (id: string, data: unknown) => Promise<unknown>;
  listQuestions: (topicId?: string) => Promise<unknown>;
};

const globalWithQuestionServiceFakes = globalThis as typeof globalThis & {
  __pmdfQuestionServiceFakes?: QuestionServiceFakes;
};

const mockedQuestionServiceSource = `
  export async function createQuestion(data) {
    return globalThis.__pmdfQuestionServiceFakes.createQuestion(data);
  }
  export async function updateQuestion(id, data) {
    return globalThis.__pmdfQuestionServiceFakes.updateQuestion(id, data);
  }
  export async function listQuestions(topicId) {
    return globalThis.__pmdfQuestionServiceFakes.listQuestions(topicId);
  }
`;

const mockedQuestionServiceUrl =
  `data:text/javascript,${encodeURIComponent(mockedQuestionServiceSource)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "../services/question.service.js" &&
      context.parentURL?.includes("/src/routes/question.routes.")
    ) {
      return { url: mockedQuestionServiceUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const { questionRoutes } = await import("../src/routes/question.routes.js");

const validQuestion = {
  topicId,
  statement: "Enunciado válido para a questão de teste.",
  options: {
    A: "Alternativa A",
    B: "Alternativa B",
    C: "Alternativa C",
    D: "Alternativa D",
    E: "Alternativa E",
  },
  correctOption: "A",
};

async function withAdminApiKey<T>(
  value: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const previousValue = process.env.ADMIN_API_KEY;

  if (value === undefined) {
    delete process.env.ADMIN_API_KEY;
  } else {
    process.env.ADMIN_API_KEY = value;
  }

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

async function createMiddlewareApp() {
  const app = Fastify();
  app.post(
    "/admin-check",
    { preHandler: requireAdmin },
    async (_request, reply) => reply.status(204).send(),
  );
  return app;
}

async function createQuestionApp() {
  const app = Fastify();
  await app.register(questionRoutes);
  return app;
}

function setQuestionServiceFakes(fakes: Partial<QuestionServiceFakes>) {
  globalWithQuestionServiceFakes.__pmdfQuestionServiceFakes = {
    createQuestion: async () => {
      throw new Error("createQuestion fake was not configured");
    },
    updateQuestion: async () => {
      throw new Error("updateQuestion fake was not configured");
    },
    listQuestions: async () => {
      throw new Error("listQuestions fake was not configured");
    },
    ...fakes,
  };
}

test("requireAdmin retorna 500 quando ADMIN_API_KEY está ausente", async (t) => {
  const app = await createMiddlewareApp();
  t.after(() => app.close());

  await withAdminApiKey(undefined, async () => {
    const response = await app.inject({ method: "POST", url: "/admin-check" });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      error: "Configuração administrativa ausente",
    });
  });
});

test("requireAdmin retorna 500 quando ADMIN_API_KEY está vazia", async (t) => {
  const app = await createMiddlewareApp();
  t.after(() => app.close());

  await withAdminApiKey("", async () => {
    const response = await app.inject({ method: "POST", url: "/admin-check" });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      error: "Configuração administrativa ausente",
    });
  });
});

test("requireAdmin retorna 401 quando x-admin-key está ausente", async (t) => {
  const app = await createMiddlewareApp();
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const response = await app.inject({ method: "POST", url: "/admin-check" });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "Acesso administrativo não autorizado",
    });
  });
});

test("requireAdmin retorna 401 quando x-admin-key está incorreta", async (t) => {
  const app = await createMiddlewareApp();
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin-check",
      headers: { "x-admin-key": "wrong-test-key" },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "Acesso administrativo não autorizado",
    });
  });
});

test("requireAdmin permite prosseguir quando x-admin-key está correta", async (t) => {
  const app = await createMiddlewareApp();
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin-check",
      headers: { "x-admin-key": adminKey },
    });

    assert.equal(response.statusCode, 204);
  });
});

test("POST /api/questions não chama criação sem autorização", async (t) => {
  let serviceCalls = 0;
  setQuestionServiceFakes({
    createQuestion: async () => {
      serviceCalls += 1;
      return { id: questionId };
    },
  });
  const app = await createQuestionApp();
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/questions",
      payload: validQuestion,
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "Acesso administrativo não autorizado",
    });
    assert.equal(serviceCalls, 0);
  });
});

test("PATCH /api/questions/:questionId não chama atualização sem autorização", async (t) => {
  let serviceCalls = 0;
  setQuestionServiceFakes({
    updateQuestion: async () => {
      serviceCalls += 1;
      return { id: questionId };
    },
  });
  const app = await createQuestionApp();
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/questions/${questionId}`,
      payload: { isActive: false },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "Acesso administrativo não autorizado",
    });
    assert.equal(serviceCalls, 0);
  });
});

test("POST /api/questions autorizado valida e chama o serviço falso", async (t) => {
  const received: unknown[] = [];
  const created = { id: questionId, ...validQuestion, isActive: true };
  setQuestionServiceFakes({
    createQuestion: async (data) => {
      received.push(data);
      return created;
    },
  });
  const app = await createQuestionApp();
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/questions",
      headers: { "x-admin-key": adminKey },
      payload: validQuestion,
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json(), created);
    assert.deepEqual(received, [{ ...validQuestion, isActive: true }]);
  });
});

test("PATCH /api/questions/:questionId autorizado valida e chama o serviço falso", async (t) => {
  const received: Array<[string, unknown]> = [];
  const updated = { id: questionId, isActive: false };
  setQuestionServiceFakes({
    updateQuestion: async (id, data) => {
      received.push([id, data]);
      return updated;
    },
  });
  const app = await createQuestionApp();
  t.after(() => app.close());

  await withAdminApiKey(adminKey, async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/questions/${questionId}`,
      headers: { "x-admin-key": adminKey },
      payload: { isActive: false },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), updated);
    assert.deepEqual(received, [[questionId, { isActive: false }]]);
  });
});
