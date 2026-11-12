import type { FastifyPluginAsync, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { generateSecureToken, hashToken } from "../security/auth-token.js";
import { hashPassword, verifyPassword } from "../security/password-hash.js";
import { requireAdmin } from "../middleware/admin-auth.js";
import type { CandidateAuthStore } from "../services/candidate-auth.store.js";

const COOKIE = "candidate_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = (production: boolean) => ({ path: "/", httpOnly: true, secure: production, sameSite: "lax" as const });

export type AuthRouteDependencies = {
  store: CandidateAuthStore;
  requireCandidate: preHandlerHookHandler;
  production?: boolean;
};

export const authRoutes: FastifyPluginAsync<AuthRouteDependencies> = async (app, { store, requireCandidate, production = process.env.NODE_ENV === "production" }) => {
  app.post("/api/auth/change-password", { preHandler: requireCandidate }, async (request, reply) => {
    const input = z.object({
      currentPassword: z.string().max(4096),
      newPassword: z.string().max(4096),
    }).strict().safeParse(request.body);
    if (!input.success) return reply.status(400).send({ error: "INVALID_INPUT" });
    if (input.data.currentPassword === input.data.newPassword) {
      return reply.status(400).send({ error: "NEW_PASSWORD_MUST_DIFFER" });
    }

    const expectedPasswordHash = await store.getCandidatePasswordHash(request.candidateId!);
    if (!expectedPasswordHash) return reply.status(409).send({ error: "PASSWORD_CHANGE_UNAVAILABLE" });
    if (!await verifyPassword(input.data.currentPassword, expectedPasswordHash)) {
      return reply.status(400).send({ error: "CURRENT_PASSWORD_INVALID" });
    }

    let newPasswordHash: string;
    try { newPasswordHash = await hashPassword(input.data.newPassword); }
    catch { return reply.status(400).send({ error: "INVALID_PASSWORD" }); }

    const changed = await store.changeCandidatePassword({
      candidateId: request.candidateId!,
      expectedPasswordHash,
      newPasswordHash,
      currentSessionId: request.candidateSessionId!,
      changedAt: new Date(),
    });
    if (!changed) return reply.status(409).send({ error: "PASSWORD_CHANGED_CONCURRENTLY" });
    return reply.status(204).send();
  });

  app.post("/api/admin/candidates/:candidateId/password", { preHandler: requireAdmin }, async (request, reply) => {
    const params = z.object({ candidateId: z.uuid() }).safeParse(request.params);
    const body = z.object({ password: z.string().max(4096) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "INVALID_INPUT" });
    let passwordHash: string;
    try { passwordHash = await hashPassword(body.data.password); }
    catch { return reply.status(400).send({ error: "INVALID_PASSWORD" }); }
    if (!await store.setCandidatePassword(params.data.candidateId, passwordHash)) return reply.status(404).send({ error: "CANDIDATE_NOT_FOUND" });
    return reply.status(204).send();
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = z.object({ email: z.string().trim().toLowerCase().email().max(255), password: z.string().max(4096) }).safeParse(request.body);
    if (!input.success) return reply.status(400).send({ error: "INVALID_INPUT" });
    const candidate = await store.findCandidateByEmail(input.data.email);
    const valid = candidate?.passwordHash ? await verifyPassword(input.data.password, candidate.passwordHash) : false;
    if (!candidate || !candidate.isActive || !valid) return reply.status(401).send({ error: "INVALID_CREDENTIALS" });
    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await store.createSession(candidate.id, hashToken(token), expiresAt);
    return reply.setCookie(COOKIE, token, { ...cookieOptions(production), expires: expiresAt }).send({ id: candidate.id, name: candidate.name, email: candidate.email });
  });

  app.post("/api/auth/logout", { preHandler: requireCandidate }, async (request, reply) => {
    await store.revokeSession(request.candidateSessionId!, new Date());
    return reply.clearCookie(COOKIE, cookieOptions(production)).status(204).send();
  });

  app.get("/api/auth/me", { preHandler: requireCandidate }, async (request, reply) => {
    const candidate = await store.getCandidate(request.candidateId!);
    if (!candidate) return reply.status(401).send({ error: "UNAUTHENTICATED" });
    return reply.send(candidate);
  });
};
