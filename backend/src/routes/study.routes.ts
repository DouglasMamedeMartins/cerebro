import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  createStudySessionSchema,
  type CreateStudySessionInput,
} from "../domain/study-session/study-session.schema.js";
import type {
  StudySessionHistoryFilters,
  StudySessionHistoryResult,
} from "../services/study-session.service.js";
import type { StudyStreak } from "../services/study-streak.service.js";

export type StudyRouteDependencies = {
  createStudySession: (
    data: CreateStudySessionInput,
    idempotencyKey?: string,
  ) => Promise<{ session: unknown; replayed: boolean }>;
  getStudyCandidate: (
    candidateId: string,
  ) => Promise<{ id: string; isActive: boolean } | undefined>;
  getTopicCoverage: (
    candidateId: string,
    topicId: string,
    now?: Date,
  ) => Promise<unknown>;
  getStudySessionHistory: (
    candidateId: string,
    filters: StudySessionHistoryFilters,
  ) => Promise<StudySessionHistoryResult>;
  getStudyStreak: (candidateId: string, now?: Date) => Promise<StudyStreak>;
};

export const studyRoutes: FastifyPluginAsync<StudyRouteDependencies> = async (
  app,
  { createStudySession, getStudyCandidate, getTopicCoverage, getStudySessionHistory, getStudyStreak },
) => {
  app.get("/api/study-sessions/streak", async (request, reply) => {
    const queryResult = z.object({}).strict().safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: queryResult.error.flatten(),
      });
    }

    return reply.send(await getStudyStreak(request.candidateId!, new Date()));
  });

  app.get("/api/study-sessions/history", async (request, reply) => {
    const querySchema = z.object({
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      page: z.coerce.number().int().positive().max(1_000_000).default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    }).strict();

    const queryResult = querySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: queryResult.error.flatten(),
      });
    }

    const { from, to, page, limit } = queryResult.data;
    if (from && to && from > to) {
      return reply.status(400).send({ error: "INVALID_DATE_RANGE" });
    }

    const result = await getStudySessionHistory(request.candidateId!, {
      from,
      to,
      page,
      limit,
    });

    return reply.send(result);
  });

  app.post("/api/study-sessions", async (request, reply) => {
    const result = createStudySessionSchema.safeParse(request.body);
    const idempotencyKey = z.uuid().optional().safeParse(request.headers["idempotency-key"]);

    if (!result.success || !idempotencyKey.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: {
          body: result.success ? null : result.error.flatten(),
          idempotencyKey: idempotencyKey.success ? null : idempotencyKey.error.flatten(),
        },
      });
    }

    let created: { session: unknown; replayed: boolean };

    try {
      created = await createStudySession(
        {
          ...result.data,
          candidateId: request.candidateId!,
        },
        idempotencyKey.data,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CANDIDATE_NOT_FOUND") {
        return reply.status(404).send({ error: "CANDIDATE_NOT_FOUND" });
      }

      if (error instanceof Error && error.message === "CANDIDATE_INACTIVE") {
        return reply.status(403).send({ error: "CANDIDATE_INACTIVE" });
      }

      if (error instanceof Error && error.message === "STUDY_PLAN_ITEM_NOT_FOUND") {
        return reply.status(404).send({ error: "STUDY_PLAN_ITEM_NOT_FOUND" });
      }

      if (error instanceof Error && error.message === "STUDY_PLAN_ITEM_TOPIC_MISMATCH") {
        return reply.status(400).send({ error: "STUDY_PLAN_ITEM_TOPIC_MISMATCH" });
      }

      if (error instanceof Error && error.message === "STUDY_SESSION_IDEMPOTENCY_CONFLICT") {
        return reply.status(409).send({ error: "STUDY_SESSION_IDEMPOTENCY_CONFLICT" });
      }

      throw error;
    }

    return reply.status(created.replayed ? 200 : 201).send(created.session);
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
