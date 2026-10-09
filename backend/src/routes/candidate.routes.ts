import type { FastifyInstance } from "fastify";
import {
  createCandidateSchema,
  updateCandidateSchema,
} from "../domain/candidate/candidate.schema.js";
import {
  createCandidate,
  getCandidateById,
  getCandidates,
  updateCandidate,
} from "../services/candidate.service.js";

export async function candidateRoutes(app: FastifyInstance) {
  app.get("/api/candidates", async (_request, reply) => {
    try {
      const candidates = await getCandidates();

      return reply.status(200).send(candidates);
    } catch (error) {
      app.log.error({ err: error }, "Erro ao listar candidatos");

      return reply.status(500).send({
        error: "Erro interno ao listar candidatos",
      });
    }
  });

  app.get("/api/candidates/:candidateId", async (request, reply) => {
    const { candidateId } = request.params as { candidateId: string };
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        candidateId,
      )
    ) {
      return reply.status(400).send({
        error: "ID do candidato inválido",
      });
    }

    try {
      const candidate = await getCandidateById(candidateId);

      if (!candidate) {
        return reply.status(404).send({
          error: "Candidato não encontrado",
        });
      }

      return reply.status(200).send(candidate);
    } catch (error) {
      app.log.error({ err: error }, "Erro ao consultar candidato");

      return reply.status(500).send({
        error: "Erro interno ao consultar candidato",
      });
    }
  });

  app.post("/api/candidates", async (request, reply) => {
    const result = createCandidateSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const candidate = await createCandidate(result.data);

      return reply.status(201).send(candidate);
    } catch (error) {
      let currentError: unknown = error;

      while (typeof currentError === "object" && currentError !== null) {
        const details = currentError as {
          code?: unknown;
          constraint?: unknown;
          message?: unknown;
          cause?: unknown;
        };

        if (
          details.code === "23505" &&
          details.constraint === "candidates_email_unique"
        ) {
          return reply.status(409).send({
            error: "Este e-mail já está cadastrado",
          });
        }

        if (
          typeof details.message === "string" &&
          details.message.includes("candidates_email_unique")
        ) {
          return reply.status(409).send({
            error: "Este e-mail já está cadastrado",
          });
        }

        currentError = details.cause;
      }

      app.log.error({ err: error }, "Erro ao criar candidato");

      return reply.status(500).send({
        error: "Erro interno ao criar candidato",
      });
    }
  });

  app.patch("/api/candidates/:candidateId", async (request, reply) => {
    const { candidateId } = request.params as { candidateId: string };

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        candidateId,
      )
    ) {
      return reply.status(400).send({
        error: "ID do candidato inválido",
      });
    }

    const result = updateCandidateSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const candidate = await updateCandidate(candidateId, result.data);

      if (!candidate) {
        return reply.status(404).send({
          error: "Candidato não encontrado",
        });
      }

      return reply.status(200).send(candidate);
    } catch (error) {
      let currentError: unknown = error;

      while (typeof currentError === "object" && currentError !== null) {
        const details = currentError as {
          code?: unknown;
          constraint?: unknown;
          message?: unknown;
          cause?: unknown;
        };

        if (
          details.code === "23505" &&
          details.constraint === "candidates_email_unique"
        ) {
          return reply.status(409).send({
            error: "Este e-mail já está cadastrado",
          });
        }

        if (
          typeof details.message === "string" &&
          details.message.includes("candidates_email_unique")
        ) {
          return reply.status(409).send({
            error: "Este e-mail já está cadastrado",
          });
        }

        currentError = details.cause;
      }

      app.log.error({ err: error }, "Erro ao atualizar candidato");

      return reply.status(500).send({
        error: "Erro interno ao atualizar candidato",
      });
    }
  });
}
