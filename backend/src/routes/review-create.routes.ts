import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { MasteryStatus } from "../domain/performance/performance.types.js";

const createReviewSchema = z.object({
  candidateId: z.uuid(),
  topicId: z.uuid(),
  masteryStatus: z.enum(["learning", "weak", "developing", "consolidated"]),
  reviewedAt: z.iso.datetime().optional(),
});

export type CreateTopicReviewInput = {
  candidateId: string;
  topicId: string;
  masteryStatus: MasteryStatus;
  reviewedAt?: Date;
};

export type ReviewCreationDependencies = {
  createTopicReview: (input: CreateTopicReviewInput) => Promise<unknown>;
};

export const reviewCreationRoutes: FastifyPluginAsync<
  ReviewCreationDependencies
> = async (app, { createTopicReview }) => {
  app.post("/api/reviews", async (request, reply) => {
    const result = createReviewSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: result.error.flatten(),
      });
    }

    try {
      const review = await createTopicReview({
        candidateId: result.data.candidateId,
        topicId: result.data.topicId,
        masteryStatus: result.data.masteryStatus,
        reviewedAt: result.data.reviewedAt
          ? new Date(result.data.reviewedAt)
          : undefined,
      });

      return reply.status(201).send(review);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "CANDIDATE_NOT_FOUND") {
          return reply.status(404).send({
            error: "CANDIDATE_NOT_FOUND",
          });
        }

        if (error.message === "CANDIDATE_INACTIVE") {
          return reply.status(403).send({
            error: "CANDIDATE_INACTIVE",
          });
        }
      }

      throw error;
    }
  });
};
