import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest { candidateId?: string; candidateSessionId?: string }
}

export function candidateIdMatches(request: FastifyRequest, reply: FastifyReply): boolean {
  const id = request.candidateId!;
  const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
  const params = request.params && typeof request.params === "object" ? request.params as Record<string, unknown> : {};
  const query = request.query && typeof request.query === "object" ? request.query as Record<string, unknown> : {};
  if ([body.candidateId, params.candidateId, query.candidateId].some((value) => value !== undefined && value !== id)) {
    reply.status(403).send({ error: "FORBIDDEN" });
    return false;
  }
  return true;
}
