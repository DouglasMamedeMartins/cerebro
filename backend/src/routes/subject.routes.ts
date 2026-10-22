import type { FastifyPluginAsync } from "fastify";
import { createSubjectSchema } from "../domain/subject/subject.schema.js";
import type { createSubject } from "../services/subject.service.js";
import { requireAdmin } from "../middleware/admin-auth.js";

export type SubjectRouteDependencies = {
  createSubject: typeof createSubject;
};

export const subjectRoutes: FastifyPluginAsync<SubjectRouteDependencies> = async (
  app,
  { createSubject },
) => {
  app.post(
    "/api/subjects",
    { preHandler: requireAdmin },
    async (request, reply) => {
    const result = createSubjectSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const subject = await createSubject(result.data);

      return reply.status(201).send(subject);
    } catch (error) {
      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao criar disciplina",
      });
    }
    },
  );
};
