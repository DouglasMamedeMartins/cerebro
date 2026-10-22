import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { candidates } from "../db/schema.js";
import { getTopicPerformance } from "../services/performance.service.js";

const performanceQuerySchema = z.object({
  candidateId: z.uuid("ID do candidato inválido"),
});

export async function performanceRoutes(app: FastifyInstance) {
  app.get("/api/performance/topics/:topicId", async (request, reply) => {
    const paramsSchema = z.object({
      topicId: z.uuid("ID do tópico inválido"),
    });

    const paramsResult = paramsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        error: "Parâmetros inválidos",
        details: paramsResult.error.flatten(),
      });
    }

    const queryResult = performanceQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      return reply.status(400).send({
        error: "Query inválida",
        details: queryResult.error.flatten(),
      });
    }

    try {
      const [candidate] = await db
        .select({
          id: candidates.id,
          isActive: candidates.isActive,
        })
        .from(candidates)
        .where(eq(candidates.id, queryResult.data.candidateId))
        .limit(1);

      if (!candidate) {
        return reply.status(404).send({
          error: "CANDIDATE_NOT_FOUND",
        });
      }

      if (!candidate.isActive) {
        return reply.status(403).send({
          error: "CANDIDATE_INACTIVE",
        });
      }

      const performance = await getTopicPerformance(
        paramsResult.data.topicId,
        queryResult.data.candidateId,
      );

      return reply.status(200).send(performance);
    } catch (error) {
      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao calcular desempenho",
      });
    }
  });
}
