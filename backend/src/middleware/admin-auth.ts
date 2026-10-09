import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const adminApiKey = process.env.ADMIN_API_KEY;
  const providedKey = request.headers["x-admin-key"];

  if (!adminApiKey) {
    request.log.error("ADMIN_API_KEY não configurada.");

    return reply.status(500).send({
      error: "Configuração administrativa ausente",
    });
  }

  if (typeof providedKey !== "string" || providedKey !== adminApiKey) {
    return reply.status(401).send({
      error: "Acesso administrativo não autorizado",
    });
  }
}
