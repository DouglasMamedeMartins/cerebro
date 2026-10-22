import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import {
  reviewCreationRoutes,
  type CreateTopicReviewInput,
} from "../src/routes/review-create.routes.js";

const payload = {
  candidateId: "11111111-1111-4111-8111-111111111111",
  topicId: "22222222-2222-4222-8222-222222222222",
  masteryStatus: "developing" as const,
  reviewedAt: "2026-05-15T12:00:00.000Z",
};

async function createTestApp(
  createTopicReview: (input: CreateTopicReviewInput) => Promise<unknown>,
) {
  const app = Fastify();
  await app.register(reviewCreationRoutes, { createTopicReview });
  return app;
}

test("responde 403 quando o candidato está desativado", async (t) => {
  const received: CreateTopicReviewInput[] = [];
  const app = await createTestApp(async (input) => {
    received.push(input);
    throw new Error("CANDIDATE_INACTIVE");
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/reviews",
    payload,
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "CANDIDATE_INACTIVE" });
  assert.deepEqual(received, [
    {
      candidateId: payload.candidateId,
      topicId: payload.topicId,
      masteryStatus: payload.masteryStatus,
      reviewedAt: new Date(payload.reviewedAt),
    },
  ]);
});

test("responde 404 quando o candidato não existe", async (t) => {
  const received: CreateTopicReviewInput[] = [];
  const app = await createTestApp(async (input) => {
    received.push(input);
    throw new Error("CANDIDATE_NOT_FOUND");
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/reviews",
    payload,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "CANDIDATE_NOT_FOUND" });
  assert.deepEqual(received, [
    {
      candidateId: payload.candidateId,
      topicId: payload.topicId,
      masteryStatus: payload.masteryStatus,
      reviewedAt: new Date(payload.reviewedAt),
    },
  ]);
});

test("responde 201 com a revisão criada e envia os dados validados", async (t) => {
  const received: CreateTopicReviewInput[] = [];
  const review = {
    id: "33333333-3333-4333-8333-333333333333",
    candidateId: payload.candidateId,
    topicId: payload.topicId,
    reviewedAt: new Date(payload.reviewedAt),
    masteryStatus: payload.masteryStatus,
    createdAt: new Date("2026-05-15T12:00:01.000Z"),
  };
  const app = await createTestApp(async (input) => {
    received.push(input);
    return review;
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/reviews",
    payload,
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    ...review,
    reviewedAt: payload.reviewedAt,
    createdAt: "2026-05-15T12:00:01.000Z",
  });
  assert.deepEqual(received, [
    {
      candidateId: payload.candidateId,
      topicId: payload.topicId,
      masteryStatus: payload.masteryStatus,
      reviewedAt: new Date(payload.reviewedAt),
    },
  ]);
});
