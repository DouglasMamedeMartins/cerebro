import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type {
  CandidateBestAction,
  CandidateBestActionTopic,
} from "../services/best-action-candidate.service.js";

export type CandidateBestActionRouteDependencies = {
  getCandidateBestAction: (
    candidateId: string,
    asOf?: Date,
  ) => Promise<CandidateBestAction | null>;
  getCandidateBestActionTopics: (
    candidateId: string,
    asOf?: Date,
  ) => Promise<CandidateBestActionTopic[]>;
};

export const candidateBestActionRoutes: FastifyPluginAsync<
  CandidateBestActionRouteDependencies
> = async (app, { getCandidateBestAction, getCandidateBestActionTopics }) => {
  /*
   * Ranking de todos os tópicos
   */
  app.get(
    "/api/candidates/:candidateId/best-action/topics",
    async (request, reply) => {
      const paramsSchema = z.object({
        candidateId: z.uuid(),
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

      try {
        const topics = await getCandidateBestActionTopics(
          paramsResult.data.candidateId,
          queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
        );

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

          if (error.message === "CANDIDATE_INACTIVE") {
            return reply.status(403).send({
              error: "CANDIDATE_INACTIVE",
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
    },
  );

  /*
   * Melhor ação real do candidato
   */
  app.get(
    "/api/candidates/:candidateId/best-action",
    async (request, reply) => {
      const paramsSchema = z.object({
        candidateId: z.uuid(),
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

      try {
        const action = await getCandidateBestAction(
          paramsResult.data.candidateId,
          queryResult.data.asOf ? new Date(queryResult.data.asOf) : new Date(),
        );

        if (!action) {
          return reply.status(404).send({
            error: "NO_ACTION_AVAILABLE",
          });
        }

        return reply.send(action);
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

          if (error.message === "CANDIDATE_WITHOUT_EDITAL") {
            return reply.status(400).send({
              error: "CANDIDATE_WITHOUT_EDITAL",
            });
          }
        }

        throw error;
      }
    },
  );
};
