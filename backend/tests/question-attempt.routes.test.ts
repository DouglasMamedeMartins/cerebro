import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import type { CreateQuestionAttemptInput } from "../src/domain/question-attempt/question-attempt.schema.js";
import {
  questionAttemptRoutes,
  type CreateQuestionAttempt,
} from "../src/routes/question-attempt.routes.js";

const payload: CreateQuestionAttemptInput = {
  candidateId: "11111111-1111-4111-8111-111111111111",
  questionId: "22222222-2222-4222-8222-222222222222",
  selectedOption: "C",
  responseTimeSeconds: 42,
  confidence: 80,
  answeredAt: "2026-05-15T12:00:00.000Z",
};

async function createTestApp(createQuestionAttempt: CreateQuestionAttempt) {
  const app = Fastify();
  await app.register(questionAttemptRoutes, { createQuestionAttempt });
  return app;
}

test("responde 403 quando o candidato está desativado", async (t) => {
  const received: CreateQuestionAttemptInput[] = [];
  const createQuestionAttempt: CreateQuestionAttempt = async (data) => {
    received.push(data);
    throw new Error("CANDIDATE_INACTIVE");
  };
  const app = await createTestApp(createQuestionAttempt);
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/question-attempts",
    payload,
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "CANDIDATE_INACTIVE" });
  assert.deepEqual(received, [payload]);
});

test("responde 404 quando o candidato não existe", async (t) => {
  const received: CreateQuestionAttemptInput[] = [];
  const createQuestionAttempt: CreateQuestionAttempt = async (data) => {
    received.push(data);
    throw new Error("CANDIDATE_NOT_FOUND");
  };
  const app = await createTestApp(createQuestionAttempt);
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/question-attempts",
    payload,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "Candidato não encontrado" });
  assert.deepEqual(received, [payload]);
});

test("responde 201 com o retorno do serviço após validar os dados", async (t) => {
  const received: CreateQuestionAttemptInput[] = [];
  const attempt = {
    id: "33333333-3333-4333-8333-333333333333",
    candidateId: payload.candidateId,
    questionId: payload.questionId,
    isCorrect: true,
    responseTimeSeconds: payload.responseTimeSeconds,
    confidence: payload.confidence,
    answeredAt: new Date(payload.answeredAt!),
    explanation: "Explicação da questão",
  };
  const createQuestionAttempt: CreateQuestionAttempt = async (data) => {
    received.push(data);
    return attempt;
  };
  const app = await createTestApp(createQuestionAttempt);
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/question-attempts",
    payload,
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    ...attempt,
    answeredAt: payload.answeredAt,
  });
  assert.deepEqual(received, [payload]);
});
