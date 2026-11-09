import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { candidateIdMatches } from "../src/middleware/candidate-identity.js";

const candidateA = "11111111-1111-4111-8111-111111111111";
const candidateB = "22222222-2222-4222-8222-222222222222";

async function checkIdentity(url: string, body?: unknown) {
  const app = Fastify();
  const handler = async (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
    request.candidateId = candidateA;
    return candidateIdMatches(request, reply) ? reply.send({ ok: true }) : reply;
  };
  app.all("/candidates/:candidateId", handler);
  app.all("/topics", handler);
  app.all("/reviews", handler);
  const response = await app.inject({ method: body ? "POST" : "GET", url, ...(body ? { payload: body } : {}) });
  await app.close();
  return response;
}

test("rejeita candidateId de outro candidato em caminho, query e corpo", async () => {
  assert.equal((await checkIdentity(`/candidates/${candidateB}`)).statusCode, 403);
  assert.equal((await checkIdentity(`/topics?candidateId=${candidateB}`)).statusCode, 403);
  assert.equal((await checkIdentity("/reviews", { candidateId: candidateB })).statusCode, 403);
});

test("permite o candidateId autenticado no corpo", async () => {
  const response = await checkIdentity("/reviews", { candidateId: candidateA });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
});
