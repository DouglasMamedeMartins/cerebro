import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { candidates } from "../db/schema.js";
import {
  calculateReviewPriority,
  createTopicReview,
  getLatestTopicReview,
  getReviewSchedule,
} from "../services/review.service.js";

export async function reviewRoutes(app: FastifyInstance) {
  app.post("/api/reviews/calculate", async (request, reply) => {
    const schema = z.object({
      masteryStatus: z.enum(["learning", "weak", "developing", "consolidated"]),
      lastReviewedAt: z.iso.datetime().nullable(),
    });

    const result = schema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: result.error.flatten(),
      });
    }

    const review = calculateReviewPriority(
      result.data.masteryStatus,
      result.data.lastReviewedAt ? new Date(result.data.lastReviewedAt) : null,
    );

    return reply.send(review);
  });

  app.get("/api/reviews/schedule/:masteryStatus", async (request, reply) => {
    const paramsSchema = z.object({
      masteryStatus: z.enum(["learning", "weak", "developing", "consolidated"]),
    });

    const result = paramsSchema.safeParse(request.params);

    if (!result.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: result.error.flatten(),
      });
    }

    return reply.send(getReviewSchedule(result.data.masteryStatus));
  });

  app.post("/api/reviews", async (request, reply) => {
    const schema = z.object({
      candidateId: z.uuid(),
      topicId: z.uuid(),
      masteryStatus: z.enum(["learning", "weak", "developing", "consolidated"]),
      reviewedAt: z.iso.datetime().optional(),
    });

    const result = schema.safeParse(request.body);

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

  app.get(
    "/api/reviews/:candidateId/:topicId/latest",
    async (request, reply) => {
      const paramsSchema = z.object({
        candidateId: z.uuid(),
        topicId: z.uuid(),
      });

      const result = paramsSchema.safeParse(request.params);

      if (!result.success) {
        return reply.status(400).send({
          error: "INVALID_INPUT",
          details: result.error.flatten(),
        });
      }

      const [candidate] = await db
        .select({
          id: candidates.id,
          isActive: candidates.isActive,
        })
        .from(candidates)
        .where(eq(candidates.id, result.data.candidateId))
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

      const review = await getLatestTopicReview(
        result.data.candidateId,
        result.data.topicId,
      );

      return reply.send(review);
    },
  );
}
