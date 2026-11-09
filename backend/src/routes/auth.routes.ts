import type { FastifyInstance } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { candidateSessions, candidates } from "../db/schema.js";
import { generateSecureToken, hashToken } from "../security/auth-token.js";
import { verifyPassword } from "../security/password-hash.js";
import { requireCandidate } from "../middleware/candidate-auth.js";
import { hashPassword } from "../security/password-hash.js";
import { requireAdmin } from "../middleware/admin-auth.js";

const COOKIE = "candidate_session";
const sevenDays = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = (production: boolean) => ({ path: "/", httpOnly: true, secure: production, sameSite: "lax" as const, ...(production ? { domain: undefined } : {}) });

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/admin/candidates/:candidateId/password", { preHandler: requireAdmin }, async (request, reply) => {
    const params = z.object({ candidateId: z.uuid() }).safeParse(request.params);
    const body = z.object({ password: z.string().max(4096) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "INVALID_INPUT" });
    let passwordHash: string;
    try { passwordHash = await hashPassword(body.data.password); }
    catch { return reply.status(400).send({ error: "INVALID_PASSWORD" }); }
    const [candidate] = await db.update(candidates).set({ passwordHash, updatedAt: new Date() }).where(and(eq(candidates.id, params.data.candidateId), eq(candidates.isActive, true))).returning({ id: candidates.id });
    if (!candidate) return reply.status(404).send({ error: "CANDIDATE_NOT_FOUND" });
    return reply.status(204).send();
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = z.object({ email: z.string().trim().toLowerCase().email().max(255), password: z.string().max(4096) }).safeParse(request.body);
    if (!input.success) return reply.status(400).send({ error: "INVALID_INPUT" });
    const email = input.data.email;
    const [candidate] = await db.select().from(candidates).where(sql`lower(${candidates.email}) = ${email}`).limit(1);
    const valid = candidate?.passwordHash ? await verifyPassword(input.data.password, candidate.passwordHash) : false;
    if (!candidate || !candidate.isActive || !valid) return reply.status(401).send({ error: "INVALID_CREDENTIALS" });
    const token = generateSecureToken();
    await db.insert(candidateSessions).values({ candidateId: candidate.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + sevenDays) });
    return reply.setCookie(COOKIE, token, { ...cookieOptions(process.env.NODE_ENV === "production"), expires: new Date(Date.now() + sevenDays) }).send({ id: candidate.id, name: candidate.name, email: candidate.email });
  });

  app.post("/api/auth/logout", { preHandler: requireCandidate }, async (request, reply) => {
    await db.update(candidateSessions).set({ revokedAt: new Date() }).where(and(eq(candidateSessions.id, request.candidateSessionId!), isNull(candidateSessions.revokedAt)));
    return reply.clearCookie(COOKIE, cookieOptions(process.env.NODE_ENV === "production")).status(204).send();
  });

  app.get("/api/auth/me", { preHandler: requireCandidate }, async (request, reply) => {
    const [candidate] = await db.select({ id: candidates.id, name: candidates.name, email: candidates.email }).from(candidates).where(eq(candidates.id, request.candidateId!)).limit(1);
    if (!candidate) return reply.status(401).send({ error: "UNAUTHENTICATED" });
    return reply.send(candidate);
  });
}
