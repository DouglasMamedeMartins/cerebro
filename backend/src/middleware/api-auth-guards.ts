import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { candidateIdMatches } from "./candidate-identity.js";

type CandidateGuard = (request: FastifyRequest, reply: FastifyReply) => unknown;

const isAdminEndpoint = (method: string, path: string) => path.startsWith("/api/admin/") ||
  (path === "/api/candidates" && ["GET", "POST"].includes(method)) ||
  (/^\/api\/candidates\/[0-9a-f-]+$/i.test(path) && ["GET", "PATCH", "DELETE"].includes(method));

export function installApiAuthGuards(app: FastifyInstance, requireCandidate: CandidateGuard, allowedOrigins: string[]) {
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && request.headers.origin && !allowedOrigins.includes(request.headers.origin)) {
      return reply.status(403).send({ error: "ORIGIN_NOT_ALLOWED" });
    }
  });
  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?", 1)[0];
    if (!path.startsWith("/api/") || path === "/api/auth/login" || path === "/api/auth/logout" || path === "/api/auth/me" || isAdminEndpoint(request.method, path)) return;
    await requireCandidate(request, reply);
    if (reply.sent) return;
    candidateIdMatches(request, reply);
  });
}
