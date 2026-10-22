import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  createStudySessionSchema,
  type CreateStudySessionInput,
} from "../domain/study-session/study-session.schema.js";

export type StudyRouteDependencies = {
  createStudySession: (data: CreateStudySessionInput) => Promise<unknown>;
  getStudyCandidate: (
    candidateId: string,
  ) => Promise<{ id: string; isActive: boolean } | undefined>;
  getTopicCoverage: (
    candidateId: string,
    topicId: string,
    now?: Date,
  ) => Promise<unknown>;
};

export const studyRoutes: FastifyPluginAsync<StudyRouteDependencies> = async (
  app,
  { createStudySession, getStudyCandidate, getTopicCoverage },
) => {
  app.post("/api/study-sessions", async (request, reply) => {
    const result = createStudySessionSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: result.error.flatten(),
      });
    }

    let session: unknown;

    try {
      session = await createStudySession(result.data);
    } catch (error) {
      if (error instanceof Error && error.message === "CANDIDATE_NOT_FOUND") {
        return reply.status(404).send({ error: "CANDIDATE_NOT_FOUND" });
      }

      if (error instanceof Error && error.message === "CANDIDATE_INACTIVE") {
        return reply.status(403).send({ error: "CANDIDATE_INACTIVE" });
      }

      throw error;
    }

    return reply.status(201).send(session);
  });

  app.get(
    "/api/study-sessions/:candidateId/:topicId/coverage",
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

      const candidate = await getStudyCandidate(paramsResult.data.candidateId);

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

      const coverage = await getTopicCoverage(
        paramsResult.data.candidateId,
        paramsResult.data.topicId,
        queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
      );

      return reply.send(coverage);
    },
  );
};
