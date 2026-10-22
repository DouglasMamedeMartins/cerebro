import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { TopicPerformance } from "../domain/performance/performance.types.js";
import type { candidates } from "../db/schema.js";

type PerformanceCandidate = Pick<
  typeof candidates.$inferSelect,
  "id" | "isActive"
>;

export type PerformanceRouteDependencies = {
  getCandidateStatus: (
    candidateId: string,
  ) => Promise<PerformanceCandidate | undefined>;
  getTopicPerformance: (
    topicId: string,
    candidateId: string,
  ) => Promise<TopicPerformance>;
};

const performanceQuerySchema = z.object({
  candidateId: z.uuid("ID do candidato inválido"),
});

export const performanceRoutes: FastifyPluginAsync<
  PerformanceRouteDependencies
> = async (app, { getCandidateStatus, getTopicPerformance }) => {
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
      const candidate = await getCandidateStatus(queryResult.data.candidateId);

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
};
