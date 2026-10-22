import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { candidates } from "../db/schema.js";
import type { TopicState } from "../domain/topic/topic-state.schema.js";

type TopicRouteCandidate = Pick<
  typeof candidates.$inferSelect,
  "id" | "isActive"
>;

export type TopicRouteDependencies = {
  getCandidateStatus: (
    candidateId: string,
  ) => Promise<TopicRouteCandidate | undefined>;
  getTopicState: (
    candidateId: string,
    topicId: string,
    asOf?: Date,
  ) => Promise<TopicState>;
};

export const topicRoutes: FastifyPluginAsync<TopicRouteDependencies> = async (
  app,
  { getCandidateStatus, getTopicState },
) => {
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

    const state = await getTopicState(
      queryResult.data.candidateId,
      paramsResult.data.topicId,
      queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
    );

    return reply.send(state);
  });
};
