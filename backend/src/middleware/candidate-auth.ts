import type { FastifyReply, FastifyRequest } from "fastify";
import { hashToken } from "../security/auth-token.js";
import type { CandidateAuthStore } from "../services/candidate-auth.store.js";
export { candidateIdMatches } from "./candidate-identity.js";

export function createRequireCandidate(store: Pick<CandidateAuthStore, "resolveSession">) {
  return async function requireCandidate(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies?.candidate_session;
    if (!token) return reply.status(401).send({ error: "UNAUTHENTICATED" });
    const session = await store.resolveSession(hashToken(token), new Date());
    if (!session) return reply.status(401).send({ error: "UNAUTHENTICATED" });
    request.candidateId = session.candidateId;
    request.candidateSessionId = session.sessionId;
  };
}
