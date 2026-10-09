import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getCandidateTopics } from "../services/candidate-topic.service.js";

export async function candidateTopicRoutes(app: FastifyInstance) {
  app.get("/api/candidates/:candidateId/topics", async (request, reply) => {
    const paramsSchema = z.object({
      candidateId: z.uuid(),
    });

    const paramsResult = paramsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: paramsResult.error.flatten(),
      });
    }

    try {
      const topics = await getCandidateTopics(paramsResult.data.candidateId);

      return reply.send({
        count: topics.length,
        topics,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "CANDIDATE_NOT_FOUND") {
          return reply.status(404).send({
            error: "CANDIDATE_NOT_FOUND",
          });
        }

        if (error.message === "CANDIDATE_WITHOUT_EDITAL") {
          return reply.status(400).send({
            error: "CANDIDATE_WITHOUT_EDITAL",
          });
        }
      }

      throw error;
    }
  });
}
