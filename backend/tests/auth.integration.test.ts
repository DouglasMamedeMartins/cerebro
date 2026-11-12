import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { authRoutes } from "../src/routes/auth.routes.js";
import { createRequireCandidate } from "../src/middleware/candidate-auth.js";
import { installApiAuthGuards } from "../src/middleware/api-auth-guards.js";
import type { AuthCandidate, CandidateAuthStore } from "../src/services/candidate-auth.store.js";
import { hashToken } from "../src/security/auth-token.js";
import { hashPassword } from "../src/security/password-hash.js";
import { studyRoutes } from "../src/routes/study.routes.js";
import { questionAttemptRoutes } from "../src/routes/question-attempt.routes.js";
import { reviewCreationRoutes } from "../src/routes/review-create.routes.js";

const candidateAId = "11111111-1111-4111-8111-111111111111";
const candidateBId = "22222222-2222-4222-8222-222222222222";
const inactiveId = "33333333-3333-4333-8333-333333333333";
const topicId = "44444444-4444-4444-8444-444444444444";
const questionId = "55555555-5555-4555-8555-555555555555";
const password = "correct horse battery staple";
const passwordHash = await hashPassword(password);
const adminKey = "auth-test-admin-key";
const globalWithQuestionFake = globalThis as typeof globalThis & { __authQuestionFake?: () => unknown };

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "../services/question.service.js" && context.parentURL?.includes("/src/routes/question.routes.")) {
      return {
        url: `data:text/javascript,${encodeURIComponent("export const createQuestion=async()=>({}); export const updateQuestion=async()=>({}); export const listQuestions=async(topicId)=>globalThis.__authQuestionFake(topicId);")}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { questionRoutes } = await import("../src/routes/question.routes.js");

function candidate(id: string, email: string, active = true, hash: string | null = passwordHash): AuthCandidate {
  return { id, email, name: `Candidate ${id[0]}`, isActive: active, passwordHash: hash };
}

class MemoryAuthStore implements CandidateAuthStore {
  candidates = new Map<string, AuthCandidate>([
    [candidateAId, candidate(candidateAId, "a@example.test")],
    [candidateBId, candidate(candidateBId, "b@example.test")],
    [inactiveId, candidate(inactiveId, "inactive@example.test", false)],
  ]);
  sessions = new Map<string, { id: string; candidateId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }>();
  private nextSession = 0;

  async findCandidateByEmail(email: string) { return [...this.candidates.values()].find((item) => item.email.toLowerCase() === email); }
  async setCandidatePassword(candidateId: string, encoded: string) {
    const item = this.candidates.get(candidateId);
    if (!item?.isActive) return false;
    item.passwordHash = encoded;
    return true;
  }
  async createSession(candidateId: string, tokenHash: string, expiresAt: Date) {
    const id = `session-${++this.nextSession}`;
    this.sessions.set(id, { id, candidateId, tokenHash, expiresAt, revokedAt: null });
    return id;
  }
  async resolveSession(tokenHash: string, now: Date) {
    const session = [...this.sessions.values()].find((item) => item.tokenHash === tokenHash && !item.revokedAt && item.expiresAt > now);
    const owner = session && this.candidates.get(session.candidateId);
    return session && owner?.isActive ? { sessionId: session.id, candidateId: owner.id } : undefined;
  }
  async revokeSession(sessionId: string, now: Date) {
    const session = this.sessions.get(sessionId);
    if (session && !session.revokedAt) session.revokedAt = now;
  }
  async getCandidate(candidateId: string) {
    const { id, name, email } = this.candidates.get(candidateId) ?? {} as AuthCandidate;
    return id ? { id, name, email } : undefined;
  }
  addSession(candidateId: string, token: string, expiresAt: Date, revokedAt: Date | null = null) {
    const id = `fixture-${++this.nextSession}`;
    this.sessions.set(id, { id, candidateId, tokenHash: hashToken(token), expiresAt, revokedAt });
    return id;
  }
}

async function makeApp(store = new MemoryAuthStore(), production = true) {
  const app = Fastify();
  const requireCandidate = createRequireCandidate(store);
  await app.register(cookie);
  installApiAuthGuards(app, requireCandidate, ["https://frontend.example.test"]);
  await app.register(authRoutes, { store, requireCandidate, production });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/private/:candidateId", async (request) => ({ candidateId: request.candidateId }));
  await app.register(studyRoutes, {
    createStudySession: async (data) => data,
    getStudySessionHistory: async (_candidateId, filters) => ({
      sessions: [],
      pagination: { page: filters.page, limit: filters.limit, total: 0, totalPages: 0 },
    }),
    getStudyStreak: async (candidateId) => ({
      currentStreak: candidateId === candidateAId ? 2 : 5,
      longestStreak: candidateId === candidateAId ? 2 : 5,
      totalStudyDays: candidateId === candidateAId ? 2 : 5,
      lastStudyDate: "2026-11-12",
      asOfDate: "2026-11-12",
    }),
    getStudyCandidate: async (id) => ({ id, isActive: true }),
    getTopicCoverage: async () => ({}),
  });
  let attemptCalls = 0;
  let reviewCalls = 0;
  await app.register(questionAttemptRoutes, { createQuestionAttempt: async (data) => { attemptCalls++; return data; } });
  await app.register(reviewCreationRoutes, { createTopicReview: async (data) => { reviewCalls++; return data; } });
  globalWithQuestionFake.__authQuestionFake = () => [{ id: questionId, statement: "shared" }];
  await app.register(questionRoutes);
  await app.ready();
  return { app, store, get attemptCalls() { return attemptCalls; }, get reviewCalls() { return reviewCalls; } };
}

function cookieHeader(response: { headers: Record<string, string | string[] | undefined> }) {
  return String(response.headers["set-cookie"]).split(";")[0];
}

async function login(app: FastifyInstance, email = "a@example.test", pass = password) {
  return app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: pass } });
}

import type { FastifyInstance } from "fastify";

test("login correto normaliza e-mail, cria somente hash de sessão e emite cookie seguro", async (t) => {
  const { app, store } = await makeApp(); t.after(() => app.close());
  const response = await login(app, "  A@EXAMPLE.TEST  ");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { id: candidateAId, name: "Candidate 1", email: "a@example.test" });
  const setCookie = String(response.headers["set-cookie"]);
  assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /Secure/i); assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Expires=/i);
  const token = cookieHeader(response).split("=")[1];
  assert.ok([...store.sessions.values()].some((session) => session.tokenHash === hashToken(token)));
  assert.ok(![...store.sessions.values()].some((session) => session.tokenHash === token));
  assert.equal(response.json().passwordHash, undefined);
});

test("login incorreto, e-mail inexistente, candidato inativo ou sem senha falha genericamente", async (t) => {
  const { app, store } = await makeApp(); t.after(() => app.close());
  store.candidates.set("66666666-6666-4666-8666-666666666666", candidate("66666666-6666-4666-8666-666666666666", "no-password@example.test", true, null));
  for (const [email, pass] of [["a@example.test", "wrong password"], ["missing@example.test", password], ["inactive@example.test", password], ["no-password@example.test", password]]) {
    const response = await login(app, email, pass);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "INVALID_CREDENTIALS" });
    assert.equal(response.headers["set-cookie"], undefined);
  }
});

test("/me retorna somente dados próprios e exige sessão válida", async (t) => {
  const { app } = await makeApp(); t.after(() => app.close());
  const loggedIn = await login(app);
  const own = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: cookieHeader(loggedIn) } });
  assert.equal(own.statusCode, 200);
  assert.deepEqual(own.json(), { id: candidateAId, name: "Candidate 1", email: "a@example.test" });
  const unauthenticated = await app.inject({ method: "GET", url: "/api/auth/me" });
  assert.equal(unauthenticated.statusCode, 401);
});

test("logout revoga sessão, limpa cookie e impede reutilização", async (t) => {
  const { app, store } = await makeApp(); t.after(() => app.close());
  const loggedIn = await login(app); const cookieValue = cookieHeader(loggedIn);
  const response = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: cookieValue } });
  assert.equal(response.statusCode, 204);
  assert.match(String(response.headers["set-cookie"]), /candidate_session=;/);
  assert.match(String(response.headers["set-cookie"]), /1970|Max-Age=0/i);
  const reused = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: cookieValue } });
  assert.equal(reused.statusCode, 401);
  assert.ok([...store.sessions.values()].some((session) => session.revokedAt !== null));
});

test("sessões expirada e inexistente são recusadas", async (t) => {
  const { app, store } = await makeApp(); t.after(() => app.close());
  for (const [token, expiry] of [["expired-token", new Date(Date.now() - 1000)], ["unrecorded-token", new Date(Date.now() + 60_000)]]) {
    if (token === "expired-token") store.addSession(candidateAId, token, expiry);
    const response = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: `candidate_session=${token}` } });
    assert.equal(response.statusCode, 401);
  }
});

test("A não lê nem grava dados de B, e B acessa os próprios dados", async (t) => {
  const { app, attemptCalls, reviewCalls } = await makeApp(); t.after(() => app.close());
  const loginA = await login(app); const cookieA = cookieHeader(loginA);
  const loginB = await login(app, "b@example.test"); const cookieB = cookieHeader(loginB);
  assert.equal((await app.inject({ method: "GET", url: `/api/private/${candidateBId}`, headers: { cookie: cookieA } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/study-sessions", headers: { cookie: cookieA }, payload: { candidateId: candidateBId, topicId, durationMinutes: 30 } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/question-attempts", headers: { cookie: cookieA }, payload: { candidateId: candidateBId, questionId, selectedOption: "A" } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/reviews", headers: { cookie: cookieA }, payload: { candidateId: candidateBId, topicId, masteryStatus: "learning" } })).statusCode, 403);
  assert.deepEqual({ attemptCalls, reviewCalls }, { attemptCalls: 0, reviewCalls: 0 });
  const ownB = await app.inject({ method: "GET", url: `/api/private/${candidateBId}`, headers: { cookie: cookieB } });
  assert.equal(ownB.statusCode, 200); assert.equal(ownB.json().candidateId, candidateBId);
});

test("questões compartilhadas aceitam candidato autenticado e health permanece pública", async (t) => {
  const { app } = await makeApp(); t.after(() => app.close());
  assert.equal((await app.inject({ method: "GET", url: "/api/questions" })).statusCode, 401);
  const loggedIn = await login(app);
  const questions = await app.inject({ method: "GET", url: "/api/questions", headers: { cookie: cookieHeader(loggedIn) } });
  assert.equal(questions.statusCode, 200); assert.equal(questions.json().count, 1);
  assert.deepEqual((await app.inject({ method: "GET", url: "/health" })).json(), { status: "ok" });
});

test("provisionamento administrativo funciona sem sessão candidata e exige chave válida", async (t) => {
  const previous = process.env.ADMIN_API_KEY; process.env.ADMIN_API_KEY = adminKey;
  const { app, store } = await makeApp(); t.after(() => { void app.close(); if (previous === undefined) delete process.env.ADMIN_API_KEY; else process.env.ADMIN_API_KEY = previous; });
  const path = `/api/admin/candidates/${candidateAId}/password`;
  const denied = await app.inject({ method: "POST", url: path, payload: { password } });
  assert.equal(denied.statusCode, 401);
  const wrongKey = await app.inject({ method: "POST", url: path, headers: { "x-admin-key": "wrong-key" }, payload: { password } });
  assert.equal(wrongKey.statusCode, 401);
  const accepted = await app.inject({ method: "POST", url: path, headers: { "x-admin-key": adminKey }, payload: { password } });
  assert.equal(accepted.statusCode, 204);
  assert.ok(await import("../src/security/password-hash.js").then(({ verifyPassword }) => verifyPassword(password, store.candidates.get(candidateAId)!.passwordHash!)));
});
