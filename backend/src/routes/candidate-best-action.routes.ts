import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  getCandidateBestAction,
  getCandidateBestActionTopics,
} from "../services/best-action-candidate.service.js";

export async function candidateBestActionRoutes(app: FastifyInstance) {
  /*
   * Ranking de todos os tópicos
   */
  app.get(
    "/api/candidates/:candidateId/best-action/topics",
    async (request, reply) => {
      const paramsSchema = z.object({
        candidateId: z.uuid(),
      });

      const querySchema = z.object({
        asOf: z.iso.datetime().optional(),
      });

      const paramsResult = paramsSchema.safeParse(request.params);

      const queryResult = querySchema.safeParse(request.query);

      if (!paramsResult.success || !queryResult.success) {
        return reply.status(400).send({
          error: "INVALID_INPUT",
          details: {
            params: paramsResult.success ? null : paramsResult.error.flatten(),

            query: queryResult.success ? null : queryResult.error.flatten(),
          },
        });
      }

      const topics = await getCandidateBestActionTopics(
        paramsResult.data.candidateId,
        queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
      );

      return reply.send({
        count: topics.length,
        topics,
      });
    },
  );

  /*
   * Melhor ação real do candidato
   */
  app.get(
    "/api/candidates/:candidateId/best-action",
    async (request, reply) => {
      const paramsSchema = z.object({
        candidateId: z.uuid(),
      });

      const querySchema = z.object({
        asOf: z.iso.datetime().optional(),
      });

      const paramsResult = paramsSchema.safeParse(request.params);

      const queryResult = querySchema.safeParse(request.query);

      if (!paramsResult.success || !queryResult.success) {
        return reply.status(400).send({
          error: "INVALID_INPUT",
          details: {
            params: paramsResult.success ? null : paramsResult.error.flatten(),

            query: queryResult.success ? null : queryResult.error.flatten(),
          },
        });
      }

      const action = await getCandidateBestAction(
        paramsResult.data.candidateId,
        queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
      );

      if (!action) {
        return reply.status(404).send({
          error: "NO_ACTION_AVAILABLE",
        });
      }

      return reply.send(action);
    },
  );
}
