import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { candidateSessions, candidates } from "../db/schema.js";
import { hashToken } from "../security/auth-token.js";
export { candidateIdMatches } from "./candidate-identity.js";

export async function requireCandidate(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies?.candidate_session;
  if (!token) return reply.status(401).send({ error: "UNAUTHENTICATED" });
  const [row] = await db.select({ sessionId: candidateSessions.id, candidateId: candidates.id })
    .from(candidateSessions).innerJoin(candidates, eq(candidateSessions.candidateId, candidates.id))
    .where(and(eq(candidateSessions.tokenHash, hashToken(token)), isNull(candidateSessions.revokedAt), gt(candidateSessions.expiresAt, new Date()), eq(candidates.isActive, true))).limit(1);
  if (!row) return reply.status(401).send({ error: "UNAUTHENTICATED" });
  request.candidateId = row.candidateId;
  request.candidateSessionId = row.sessionId;
}

