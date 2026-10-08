import type { FastifyInstance } from "fastify";
import { createQuestionSchema } from "../domain/question/question.schema.js";
import { createQuestion } from "../services/question.service.js";

export async function questionRoutes(app: FastifyInstance) {
  app.post("/api/questions", async (request, reply) => {
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
  });
}
