import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { localStudyDate } from "../services/daily-study-plan.service.js";
import type {
  DailyStudyPlanListFilters,
  DailyStudyPlanListResult,
  DailyStudyPlanWithItems,
  GenerateDailyStudyPlanResult,
} from "../services/daily-study-plan.service.js";
import type {
  DailyPlanItemDecision,
  RecordDailyPlanItemDecisionResult,
} from "../services/daily-plan-item-event.service.js";

export type StudyPlanRouteDependencies = {
  generateDailyStudyPlan: (input: {
    candidateId: string;
    availableMinutes: number;
    idempotencyKey: string;
  }) => Promise<GenerateDailyStudyPlanResult>;
  getCurrentPlan: (candidateId: string, planDate: string) => Promise<DailyStudyPlanWithItems | undefined>;
  listPlans: (candidateId: string, filters: DailyStudyPlanListFilters) => Promise<DailyStudyPlanListResult>;
  getPlanDetails: (candidateId: string, planId: string) => Promise<DailyStudyPlanWithItems | undefined>;
  recordItemDecision: (input: {
    candidateId: string;
    planId: string;
    planItemId: string;
    eventType: DailyPlanItemDecision;
    idempotencyKey: string;
    replacementTopicId?: string;
  }) => Promise<RecordDailyPlanItemDecisionResult>;
};

const requestSchema = z.object({
  availableMinutes: z.number().int().positive().max(720),
}).strict();

const headersSchema = z.object({
  "idempotency-key": z.uuid(),
});

const listQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().positive().max(1_000_000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict();

function serializePlan(result: DailyStudyPlanWithItems, includeExecution = false) {
  const { plan, items } = result;
  return {
    plan: {
      id: plan.id,
      planDate: plan.planDate,
      timeZone: plan.timeZone,
      availableMinutes: plan.availableMinutes,
      version: plan.version,
      generatedAt: plan.generatedAt,
    },
    items: items.map((item) => ({
      id: item.id,
      presentationOrder: item.presentationOrder,
      rankingPosition: item.rankingPosition,
      topicId: item.topicId,
      topicName: item.topicName,
      subjectName: item.subjectName,
      activityType: item.activityType,
      recommendedDurationMinutes: item.recommendedDurationMinutes,
      priorityLevel: item.priorityLevel,
      priorityScore: item.priorityScore,
      reason: item.reason,
      explanation: item.explanation,
      expectedImpact: item.expectedImpact,
      recommendationSource: item.recommendationSource,
      ...(includeExecution ? {
        execution: item.execution ?? {
          executedMinutes: 0,
          sessionCount: 0,
          recommendedTimePercent: 0,
          status: "not_started" as const,
          lastSessionAt: null,
          events: [],
        },
      } : {}),
    })),
  };
}

export const studyPlanRoutes: FastifyPluginAsync<StudyPlanRouteDependencies> = async (
  app,
  { generateDailyStudyPlan, getCurrentPlan, listPlans, getPlanDetails, recordItemDecision },
) => {
  const recordDecision = async (
    request: FastifyRequest,
    reply: FastifyReply,
    eventType: DailyPlanItemDecision,
  ) => {
    const paramsResult = z.object({ planId: z.uuid(), itemId: z.uuid() }).safeParse(request.params);
    const headersResult = headersSchema.safeParse(request.headers);
    const bodySchema = eventType === "replaced"
      ? z.object({ replacementTopicId: z.uuid() }).strict()
      : z.object({}).strict();
    const bodyResult = bodySchema.safeParse(request.body ?? {});

    if (!paramsResult.success || !headersResult.success || !bodyResult.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: {
          params: paramsResult.success ? null : paramsResult.error.flatten(),
          idempotencyKey: headersResult.success ? null : headersResult.error.flatten(),
          body: bodyResult.success ? null : bodyResult.error.flatten(),
        },
      });
    }

    try {
      const result = await recordItemDecision({
        candidateId: request.candidateId!,
        planId: paramsResult.data.planId,
        planItemId: paramsResult.data.itemId,
        eventType,
        idempotencyKey: headersResult.data["idempotency-key"],
        ...(eventType === "replaced" ? {
          replacementTopicId: (bodyResult.data as unknown as { replacementTopicId: string }).replacementTopicId,
        } : {}),
      });
      const { event } = result;
      return reply.status(result.replayed ? 200 : 201).send({
        id: event.id,
        planId: event.planId,
        planItemId: event.planItemId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        data: event.data,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "STUDY_PLAN_NOT_FOUND") {
        return reply.status(404).send({ error: "STUDY_PLAN_NOT_FOUND" });
      }
      if (error instanceof Error && error.message === "STUDY_PLAN_ITEM_NOT_FOUND") {
        return reply.status(404).send({ error: "STUDY_PLAN_ITEM_NOT_FOUND" });
      }
      if (error instanceof Error && error.message === "REPLACEMENT_TOPIC_NOT_IN_CANDIDATE_EDITAL") {
        return reply.status(400).send({ error: "INVALID_REPLACEMENT_TOPIC" });
      }
      if (error instanceof Error && [
        "DAILY_PLAN_ITEM_EVENT_IDEMPOTENCY_CONFLICT",
        "DAILY_PLAN_ITEM_ALREADY_DECIDED",
      ].includes(error.message)) {
        return reply.status(409).send({ error: error.message });
      }
      throw error;
    }
  };

  app.post("/api/study-plans/:planId/items/:itemId/complete", (request, reply) =>
    recordDecision(request, reply, "completed"));
  app.post("/api/study-plans/:planId/items/:itemId/ignore", (request, reply) =>
    recordDecision(request, reply, "ignored"));
  app.post("/api/study-plans/:planId/items/:itemId/replace", (request, reply) =>
    recordDecision(request, reply, "replaced"));

  app.get("/api/study-plans/current", async (request, reply) => {
    const queryResult = z.object({}).strict().safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({ error: "INVALID_INPUT", details: queryResult.error.flatten() });
    }

    const result = await getCurrentPlan(request.candidateId!, localStudyDate(new Date()));
    return reply.send(result ? serializePlan(result, true) : { plan: null, items: [] });
  });

  app.get("/api/study-plans", async (request, reply) => {
    const queryResult = listQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({ error: "INVALID_INPUT", details: queryResult.error.flatten() });
    }

    const { from, to, page, limit } = queryResult.data;
    if (from && to && from > to) {
      return reply.status(400).send({ error: "INVALID_DATE_RANGE" });
    }

    return reply.send(await listPlans(request.candidateId!, { from, to, page, limit }));
  });

  app.get("/api/study-plans/:planId", async (request, reply) => {
    const paramsResult = z.object({ planId: z.uuid() }).safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: "INVALID_INPUT", details: paramsResult.error.flatten() });
    }

    const result = await getPlanDetails(request.candidateId!, paramsResult.data.planId);
    return result
      ? reply.send(serializePlan(result, true))
      : reply.status(404).send({ error: "STUDY_PLAN_NOT_FOUND" });
  });

  app.post("/api/study-plans/generate", async (request, reply) => {
    const bodyResult = requestSchema.safeParse(request.body);
    const headersResult = headersSchema.safeParse(request.headers);

    if (!bodyResult.success || !headersResult.success) {
      return reply.status(400).send({
        error: "INVALID_INPUT",
        details: {
          body: bodyResult.success ? null : bodyResult.error.flatten(),
          headers: headersResult.success ? null : headersResult.error.flatten(),
        },
      });
    }

    try {
      const result = await generateDailyStudyPlan({
        candidateId: request.candidateId!,
        availableMinutes: bodyResult.data.availableMinutes,
        idempotencyKey: headersResult.data["idempotency-key"],
      });
      return reply.status(result.replayed ? 200 : 201).send(serializePlan(result));
    } catch (error) {
      if (error instanceof Error && error.message === "NO_ACTION_AVAILABLE") {
        return reply.status(404).send({ error: "NO_ACTION_AVAILABLE" });
      }
      if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") {
        return reply.status(409).send({ error: "IDEMPOTENCY_CONFLICT" });
      }
      if (error instanceof Error && error.message === "CANDIDATE_NOT_FOUND") {
        return reply.status(404).send({ error: "CANDIDATE_NOT_FOUND" });
      }
      if (error instanceof Error && error.message === "CANDIDATE_INACTIVE") {
        return reply.status(403).send({ error: "CANDIDATE_INACTIVE" });
      }
      if (error instanceof Error && error.message === "CANDIDATE_WITHOUT_EDITAL") {
        return reply.status(400).send({ error: "CANDIDATE_WITHOUT_EDITAL" });
      }
      throw error;
    }
  });
};
