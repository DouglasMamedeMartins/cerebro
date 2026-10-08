import type { FastifyInstance } from "fastify";
import { createTopicSchema } from "../domain/topic/topic.schema.js";
import { createTopic } from "../services/topic.service.js";

export async function topicRoutes(app: FastifyInstance) {
  app.post("/api/topics", async (request, reply) => {
    const result = createTopicSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const topic = await createTopic(result.data);

      return reply.status(201).send(topic);
    } catch (error) {
      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao criar tópico",
      });
    }
  });
}
