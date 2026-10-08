import type { FastifyInstance } from "fastify";
import { createCandidateSchema } from "../domain/candidate/candidate.schema.js";
import { createCandidate } from "../services/candidate.service.js";

export async function candidateRoutes(app: FastifyInstance) {
  app.post("/api/candidates", async (request, reply) => {
    const result = createCandidateSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const candidate = await createCandidate(result.data);

      return reply.status(201).send(candidate);
    } catch (error) {
      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao criar candidato",
      });
    }
  });
}
