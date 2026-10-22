import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/index.js";
import { candidates } from "../db/schema.js";
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

    const state = await getTopicState(
      queryResult.data.candidateId,
      paramsResult.data.topicId,
      queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
    );

    return reply.send(state);
  });
}
