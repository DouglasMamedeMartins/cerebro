import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  buildPriorityFromPerformance,
  calculateTopicPriority,
  calculateTopicPriorityForCandidate,
  getTopicIncidencePriority,
  getTopicWeightPriority,
} from "../services/priority.service.js";

const prioritySchema = z.object({
  deficit: z.number().min(0).max(100),
  weight: z.number().min(0).max(100),
  incidence: z.number().min(0).max(100),
  coverage: z.number().min(0).max(100),
  review: z.number().min(0).max(100),
  trend: z.number().min(0).max(100),
  errors: z.number().min(0).max(100),
  urgency: z.number().min(0).max(100),
});

export async function priorityRoutes(app: FastifyInstance) {
  app.post("/api/priority/calculate", async (request, reply) => {
    const result = prioritySchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.flatten(),
      });
    }

    const priority = calculateTopicPriority(result.data);

    return reply.status(200).send(priority);
  });

  app.post("/api/priority/from-performance", async (request, reply) => {
    const performanceSchema = z.object({
      mastery: z.number().min(0).max(100),

      trend: z.enum([
        "strong_improvement",
        "improvement",
        "stable",
        "decline",
        "strong_decline",
      ]),

      attempts: z.number().int().nonnegative(),

      incorrectAnswers: z.number().int().nonnegative(),

      weight: z.number().positive().nullable(),

      maxWeight: z.number().positive().nullable(),
      examDate: z.iso.datetime().nullable(),
    });
    const result = performanceSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.flatten(),
      });
    }

    const factors = buildPriorityFromPerformance(
      {
        mastery: result.data.mastery,
        trend: result.data.trend,
        attempts: result.data.attempts,
        incorrectAnswers: result.data.incorrectAnswers,
      },
      {
        weight: result.data.weight,
        maxWeight: result.data.maxWeight,
        examDate: result.data.examDate ? new Date(result.data.examDate) : null,
      },
    );

    const priority = calculateTopicPriority(factors);

    return reply.status(200).send(priority);
  });

  app.get("/api/priority/topics/:topicId/weight", async (request, reply) => {
    const paramsSchema = z.object({
      topicId: z.uuid("ID do tópico inválido"),
    });

    const result = paramsSchema.safeParse(request.params);

    if (!result.success) {
      return reply.status(400).send({
        error: "Parâmetros inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const weight = await getTopicWeightPriority(result.data.topicId);

      return reply.status(200).send(weight);
    } catch (error) {
      if (error instanceof Error && error.message === "TOPIC_NOT_FOUND") {
        return reply.status(404).send({
          error: "Tópico não encontrado",
        });
      }

      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao consultar peso do tópico",
      });
    }
  });

  app.get("/api/priority/topics/:topicId", async (request, reply) => {
    const paramsSchema = z.object({
      topicId: z.uuid("ID do tópico inválido"),
    });

    const querySchema = z.object({
      candidateId: z.uuid("ID do candidato inválido"),
    });

    const paramsResult = paramsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        error: "Parâmetros inválidos",
        details: paramsResult.error.flatten(),
      });
    }

    const queryResult = querySchema.safeParse(request.query);

    if (!queryResult.success) {
      return reply.status(400).send({
        error: "Query inválida",
        details: queryResult.error.flatten(),
      });
    }

    try {
      const priority = await calculateTopicPriorityForCandidate(
        paramsResult.data.topicId,
        queryResult.data.candidateId,
      );

      return reply.status(200).send(priority);
    } catch (error) {
      if (error instanceof Error && error.message === "TOPIC_NOT_FOUND") {
        return reply.status(404).send({
          error: "Tópico não encontrado",
        });
      }

      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao calcular prioridade",
      });
    }
  });

  app.get("/api/priority/topics/:topicId/incidence", async (request, reply) => {
    const paramsSchema = z.object({
      topicId: z.uuid("ID do tópico inválido"),
    });

    const result = paramsSchema.safeParse(request.params);

    if (!result.success) {
      return reply.status(400).send({
        error: "Parâmetros inválidos",
        details: result.error.flatten(),
      });
    }

    try {
      const incidence = await getTopicIncidencePriority(result.data.topicId);

      return reply.status(200).send({
        topicId: result.data.topicId,
        incidence,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "TOPIC_NOT_FOUND") {
        return reply.status(404).send({
          error: "Tópico não encontrado",
        });
      }

      app.log.error(error);

      return reply.status(500).send({
        error: "Erro interno ao calcular incidência",
      });
    }
  });
}
