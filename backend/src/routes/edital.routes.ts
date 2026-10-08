import type { FastifyInstance } from "fastify";
import { createEditalSchema } from "../domain/edital/edital.schema.js";
import { createEdital } from "../services/edital.service.js";

export async function editalRoutes(app: FastifyInstance) {
  app.post("/api/edital-versions", async (request, reply) => {
    const result = createEditalSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const edital = await createEdital(result.data);

      return reply.status(201).send(edital);
    } catch (error) {
      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao criar edital",
      });
    }
  });
}
