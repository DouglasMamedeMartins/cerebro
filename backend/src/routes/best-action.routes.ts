import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getBestAction } from "../services/best-action.service.js";

export async function bestActionRoutes(app: FastifyInstance) {
  app.get<{
    Params: {
      candidateId: string;
      topicId: string;
    };
  }>(
    "/api/candidates/:candidateId/best-action/:topicId",
    async (request, reply) => {
      const paramsSchema = z.object({
        candidateId: z.uuid(),
        topicId: z.uuid(),
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

      const action = await getBestAction(
        paramsResult.data.candidateId,
        paramsResult.data.topicId,
        queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
      );

      return reply.send(action);
    },
  );
}
