import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getTopicState } from "../services/topic-state.service.js";

export async function topicRoutes(app: FastifyInstance) {
  app.get("/api/topics/:topicId/state", async (request, reply) => {
    const paramsSchema = z.object({
      topicId: z.uuid(),
    });

    const querySchema = z.object({
      candidateId: z.uuid(),
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

    const state = await getTopicState(
      queryResult.data.candidateId,
      paramsResult.data.topicId,
      queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
    );

    return reply.send(state);
  });
}
