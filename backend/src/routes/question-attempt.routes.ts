import type { FastifyPluginAsync } from "fastify";

import {
  createQuestionAttemptSchema,
  type CreateQuestionAttemptInput,
} from "../domain/question-attempt/question-attempt.schema.js";

export type CreateQuestionAttempt = (
  data: CreateQuestionAttemptInput,
) => Promise<unknown>;

type QuestionAttemptRouteOptions = {
  createQuestionAttempt: CreateQuestionAttempt;
};

export const questionAttemptRoutes: FastifyPluginAsync<
  QuestionAttemptRouteOptions
> = async (app, { createQuestionAttempt }) => {
  app.post("/api/question-attempts", async (request, reply) => {
    const result = createQuestionAttemptSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const attempt = await createQuestionAttempt(result.data);

      return reply.status(201).send(attempt);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "CANDIDATE_NOT_FOUND") {
          return reply.status(404).send({
            error: "Candidato não encontrado",
          });
        }

        if (error.message === "CANDIDATE_INACTIVE") {
          return reply.status(403).send({
            error: "CANDIDATE_INACTIVE",
          });
        }

        if (error.message === "QUESTION_NOT_FOUND") {
          return reply.status(404).send({
            error: "Questão não encontrada",
          });
        }

        if (error.message === "QUESTION_ANSWER_KEY_MISSING") {
          return reply.status(409).send({
            error: "Esta questão ainda não possui gabarito cadastrado",
            code: "QUESTION_ANSWER_KEY_MISSING",
          });
        }
      }

      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao registrar tentativa",
      });
    }
  });
};
