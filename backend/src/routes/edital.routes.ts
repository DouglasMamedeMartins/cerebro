import type { FastifyPluginAsync } from "fastify";
import { createEditalSchema } from "../domain/edital/edital.schema.js";
import type { createEdital } from "../services/edital.service.js";
import { requireAdmin } from "../middleware/admin-auth.js";

export type EditalRouteDependencies = {
  createEdital: typeof createEdital;
};

export const editalRoutes: FastifyPluginAsync<EditalRouteDependencies> = async (
  app,
  { createEdital },
) => {
  app.post(
    "/api/edital-versions",
    { preHandler: requireAdmin },
    async (request, reply) => {
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
    },
  );
};
