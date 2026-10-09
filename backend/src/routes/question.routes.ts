import type { FastifyInstance } from "fastify";
import {
  createQuestionSchema,
  updateQuestionSchema,
} from "../domain/question/question.schema.js";
import {
  createQuestion,
  listQuestions,
  updateQuestion,
} from "../services/question.service.js";
import z from "zod";
import { requireAdmin } from "../middleware/admin-auth.js";

export async function questionRoutes(app: FastifyInstance) {
  app.post(
    "/api/questions",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const result = createQuestionSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Dados inválidos",
          details: result.error.flatten(),
        });
      }

      try {
        const question = await createQuestion(result.data);

        return reply.status(201).send(question);
      } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
          error: "Erro interno ao criar questão",
        });
      }
    },
  );

  app.patch(
    "/api/questions/:questionId",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const paramsSchema = z.object({
        questionId: z.uuid("ID da questão inválido"),
      });

      const paramsResult = paramsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          error: "Parâmetros inválidos",
          details: paramsResult.error.flatten(),
        });
      }

      const result = updateQuestionSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Dados inválidos",
          details: result.error.flatten(),
        });
      }

      try {
        const question = await updateQuestion(
          paramsResult.data.questionId,
          result.data,
        );

        return reply.status(200).send(question);
      } catch (error) {
        if (error instanceof Error && error.message === "QUESTION_NOT_FOUND") {
          return reply.status(404).send({
            error: "Questão não encontrada",
          });
        }

        app.log.error(error);

        return reply.status(500).send({
          error: "Erro interno ao atualizar questão",
        });
      }
    },
  );

  app.get("/api/questions", async (request, reply) => {
    const querySchema = z.object({
      topicId: z.uuid("ID do tópico inválido").optional(),
    });

    const result = querySchema.safeParse(request.query);

    if (!result.success) {
      return reply.status(400).send({
        error: "Parâmetros inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const questions = await listQuestions(result.data.topicId);

      return reply.status(200).send({
        count: questions.length,
        questions,
      });
    } catch (error) {
      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao listar questões",
      });
    }
  });
}
