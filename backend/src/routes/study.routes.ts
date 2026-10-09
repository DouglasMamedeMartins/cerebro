import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../db/index.js";
import { studySessions } from "../db/schema.js";
import { getTopicCoverage } from "../services/coverage.service.js";

export async function studyRoutes(app: FastifyInstance) {
  app.post("/api/study-sessions", async (request, reply) => {
    const schema = z.object({
      candidateId: z.uuid(),
      topicId: z.uuid(),
      durationMinutes: z.number().int().positive(),
      studiedAt: z.iso.datetime().optional(),
    });

    const result = schema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: result.error.flatten(),
      });
    }

    const [session] = await db
      .insert(studySessions)
      .values({
        candidateId: result.data.candidateId,
        topicId: result.data.topicId,
        durationMinutes: result.data.durationMinutes,
        studiedAt: result.data.studiedAt
          ? new Date(result.data.studiedAt)
          : new Date(),
      })
      .returning();

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

      const coverage = await getTopicCoverage(
        paramsResult.data.candidateId,
        paramsResult.data.topicId,
        queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
      );

      return reply.send(coverage);
    },
  );
}
