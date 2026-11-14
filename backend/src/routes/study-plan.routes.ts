import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
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
import type { RecordDailyPlanManualChangeResult } from "../services/daily-plan-manual-change.service.js";

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
  recordManualChange: (input: {
    candidateId: string;
    planId: string;
    planItemId: string;
    idempotencyKey: string;
    data: unknown;
    operationFingerprintPayload?: unknown;
  }) => Promise<RecordDailyPlanManualChangeResult>;
  getManualActivityTopic: (candidateId: string, topicId: string) => Promise<{
    topicId: string;
    topicName: string;
    subjectName: string;
  } | undefined>;
};

const requestSchema = z.object({
  availableMinutes: z.number().int().positive().max(720),
}).strict();

const headersSchema = z.object({
  "idempotency-key": z.uuid(),
});

const reorderBodySchema = z.object({
  itemIds: z.array(z.uuid()).min(1).max(1000).superRefine((itemIds, context) => {
    if (new Set(itemIds).size !== itemIds.length) {
      context.addIssue({ code: "custom", message: "IDs de item duplicados" });
    }
  }),
}).strict();

const durationBodySchema = z.object({
  plannedDurationMinutes: z.number().int().positive().max(2_147_483_647),
}).strict();

const addActivityBodySchema = z.object({
  topicId: z.uuid(),
  activityType: z.enum(["study", "review", "questions", "mixed", "maintenance"]),
  plannedDurationMinutes: z.number().int().positive().max(2_147_483_647),
  presentationOrder: z.number().int().positive().max(1000).optional(),
}).strict();

const listQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().positive().max(1_000_000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict();

function serializePlan(result: DailyStudyPlanWithItems, includeExecution = false, scheduledOnly = false) {
  const { plan, items } = result;
  const visibleItems = scheduledOnly
    ? items.filter((item) => item.personalization?.isScheduled ?? item.recommendationSource !== "manual")
    : items;
  return {
    plan: {
      id: plan.id,
      planDate: plan.planDate,
      timeZone: plan.timeZone,
      availableMinutes: plan.availableMinutes,
      version: plan.version,
      generatedAt: plan.generatedAt,
    },
    items: visibleItems.map((item) => ({
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
      personalization: item.personalization ?? {
        presentationOrder: item.recommendationSource === "manual" ? null : item.presentationOrder,
        plannedDurationMinutes: item.recommendedDurationMinutes,
        isScheduled: item.recommendationSource !== "manual",
        isManual: item.recommendationSource === "manual",
      },
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
  { generateDailyStudyPlan, getCurrentPlan, listPlans, getPlanDetails, recordItemDecision, recordManualChange, getManualActivityTopic },
) => {
  const sendManualChange = async (
    reply: FastifyReply,
    candidateId: string,
    planId: string,
    result: RecordDailyPlanManualChangeResult,
  ) => {
    const freshPlan = await getPlanDetails(candidateId, planId);
    if (!freshPlan) return reply.status(404).send({ error: "STUDY_PLAN_NOT_FOUND" });
    return reply.status(result.replayed ? 200 : 201).send({
      event: {
        id: result.event.id,
        planId: result.event.planId,
        planItemId: result.event.planItemId,
        eventType: result.event.eventType,
        occurredAt: result.event.occurredAt,
        data: result.event.data,
      },
      plan: serializePlan(freshPlan, true),
    });
  };

  const manualChangeError = (error: unknown, reply: FastifyReply) => {
    if (!(error instanceof Error)) return undefined;
    if (error.message === "STUDY_PLAN_NOT_FOUND") return reply.status(404).send({ error: error.message });
    if (error.message === "STUDY_PLAN_ITEM_NOT_FOUND") return reply.status(404).send({ error: error.message });
    if ([
      "DAILY_PLAN_MANUAL_CHANGE_IDEMPOTENCY_CONFLICT",
      "DAILY_PLAN_MANUAL_CHANGE_TERMINAL_CONFLICT",
      "DAILY_PLAN_MANUAL_CHANGE_STALE",
      "DAILY_PLAN_MANUAL_CHANGE_ORDER_CONFLICT",
      "DAILY_PLAN_MANUAL_CHANGE_REORDER_SET_MISMATCH",
      "DAILY_PLAN_MANUAL_CHANGE_ITEM_CONFLICT",
      "DAILY_PLAN_MANUAL_CHANGE_DUPLICATE_ACTIVITY",
    ].includes(error.message)) return reply.status(409).send({ error: error.message });
    return undefined;
  };

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

  app.post("/api/study-plans/:planId/reorder", async (request, reply) => {
    const paramsResult = z.object({ planId: z.uuid() }).safeParse(request.params);
    const headersResult = headersSchema.safeParse(request.headers);
    const bodyResult = reorderBodySchema.safeParse(request.body);
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

    const { planId } = paramsResult.data;
    const { itemIds } = bodyResult.data;
    const currentPlan = await getPlanDetails(request.candidateId!, planId);
    if (!currentPlan) return reply.status(404).send({ error: "STUDY_PLAN_NOT_FOUND" });

    // Build the same normalized event before entering the service. Exact membership,
    // terminal state, and stale order are rechecked under the plan transaction lock.
    // This also lets an idempotent retry pass through if a later event made an item terminal.
    const byId = new Map(currentPlan.items.map((item) => [item.id, item]));
    if (itemIds.some((itemId) => !byId.has(itemId))) {
      return reply.status(409).send({ error: "DAILY_PLAN_MANUAL_CHANGE_REORDER_SET_MISMATCH" });
    }
    if (itemIds.length === 0) {
      return reply.status(409).send({ error: "DAILY_PLAN_MANUAL_CHANGE_REORDER_SET_MISMATCH" });
    }

    const slots = itemIds
      .map((itemId) => byId.get(itemId)!.personalization?.presentationOrder ?? byId.get(itemId)!.presentationOrder)
      .sort((left, right) => left - right);
    const data = {
      version: 1 as const,
      operation: "reorder" as const,
      changes: itemIds.map((itemId, index) => ({
        itemId,
        previousOrder: byId.get(itemId)!.personalization?.presentationOrder ?? byId.get(itemId)!.presentationOrder,
        newOrder: slots[index]!,
      })),
    };

    try {
      const result = await recordManualChange({
        candidateId: request.candidateId!,
        planId,
        planItemId: itemIds[0]!,
        idempotencyKey: headersResult.data["idempotency-key"],
        data,
        operationFingerprintPayload: { operation: "reorder", itemIds },
      });
      return sendManualChange(reply, request.candidateId!, planId, result);
    } catch (error) {
      const mapped = manualChangeError(error, reply);
      if (mapped) return mapped;
      throw error;
    }
  });

  app.post("/api/study-plans/:planId/items/:itemId/duration", async (request, reply) => {
    const paramsResult = z.object({ planId: z.uuid(), itemId: z.uuid() }).safeParse(request.params);
    const headersResult = headersSchema.safeParse(request.headers);
    const bodyResult = durationBodySchema.safeParse(request.body);
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

    const { planId, itemId } = paramsResult.data;
    const currentPlan = await getPlanDetails(request.candidateId!, planId);
    if (!currentPlan) return reply.status(404).send({ error: "STUDY_PLAN_NOT_FOUND" });
    const item = currentPlan.items.find((entry) => entry.id === itemId);
    if (!item) return reply.status(404).send({ error: "STUDY_PLAN_ITEM_NOT_FOUND" });
    const previousDurationMinutes = item.personalization?.plannedDurationMinutes ?? item.recommendedDurationMinutes;
    const newDurationMinutes = bodyResult.data.plannedDurationMinutes;
    const data = {
      version: 1 as const,
      operation: "duration_changed" as const,
      itemId,
      previousDurationMinutes,
      newDurationMinutes,
    };

    try {
      const result = await recordManualChange({
        candidateId: request.candidateId!,
        planId,
        planItemId: itemId,
        idempotencyKey: headersResult.data["idempotency-key"],
        data,
        operationFingerprintPayload: { operation: "duration_changed", itemId, newDurationMinutes },
      });
      return sendManualChange(reply, request.candidateId!, planId, result);
    } catch (error) {
      const mapped = manualChangeError(error, reply);
      if (mapped) return mapped;
      throw error;
    }
  });

  app.post("/api/study-plans/:planId/items/:itemId/unschedule", async (request, reply) => {
    const paramsResult = z.object({ planId: z.uuid(), itemId: z.uuid() }).safeParse(request.params);
    const headersResult = headersSchema.safeParse(request.headers);
    const bodyResult = z.object({}).strict().safeParse(request.body ?? {});
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

    const { planId, itemId } = paramsResult.data;
    const candidateId = request.candidateId!;
    const currentPlan = await getPlanDetails(candidateId, planId);
    if (!currentPlan) return reply.status(404).send({ error: "STUDY_PLAN_NOT_FOUND" });
    const item = currentPlan.items.find((entry) => entry.id === itemId);
    if (!item) return reply.status(404).send({ error: "STUDY_PLAN_ITEM_NOT_FOUND" });

    // Keep the request fingerprint independent of derived order so retries still replay
    // after the first event has already changed the projection.
    const data = {
      version: 1 as const,
      operation: "unscheduled" as const,
      itemId,
      previousScheduled: true as const,
      scheduled: false as const,
      previousOrder: item.personalization?.presentationOrder ?? item.presentationOrder,
      newOrder: null,
    };

    try {
      const result = await recordManualChange({
        candidateId,
        planId,
        planItemId: itemId,
        idempotencyKey: headersResult.data["idempotency-key"],
        data,
        operationFingerprintPayload: { operation: "unscheduled", itemId },
      });
      return sendManualChange(reply, candidateId, planId, result);
    } catch (error) {
      const mapped = manualChangeError(error, reply);
      if (mapped) return mapped;
      throw error;
    }
  });

  app.post("/api/study-plans/:planId/items", async (request, reply) => {
    const paramsResult = z.object({ planId: z.uuid() }).safeParse(request.params);
    const headersResult = headersSchema.safeParse(request.headers);
    const bodyResult = addActivityBodySchema.safeParse(request.body);
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

    const { planId } = paramsResult.data;
    const { topicId, activityType, plannedDurationMinutes, presentationOrder } = bodyResult.data;
    const candidateId = request.candidateId!;
    const currentPlan = await getPlanDetails(candidateId, planId);
    if (!currentPlan) return reply.status(404).send({ error: "STUDY_PLAN_NOT_FOUND" });
    const topic = await getManualActivityTopic(candidateId, topicId);
    if (!topic) return reply.status(400).send({ error: "TOPIC_NOT_IN_CANDIDATE_EDITAL" });

    const scheduled = currentPlan.items
      .filter((item) => item.personalization?.isScheduled !== false)
      .sort((left, right) =>
        (left.personalization?.presentationOrder ?? left.presentationOrder)
          - (right.personalization?.presentationOrder ?? right.presentationOrder));
    const lastOrder = scheduled.reduce((maximum, item) => Math.max(
      maximum,
      item.personalization?.presentationOrder ?? item.presentationOrder,
    ), 0);
    const newOrder = presentationOrder ?? lastOrder + 1;
    if (newOrder > lastOrder + 1) return reply.status(400).send({ error: "INVALID_PRESENTATION_ORDER" });

    const shiftedItems = scheduled
      .filter((item) => (item.personalization?.presentationOrder ?? item.presentationOrder) >= newOrder)
      .map((item) => ({
        itemId: item.id,
        previousOrder: item.personalization?.presentationOrder ?? item.presentationOrder,
        newOrder: (item.personalization?.presentationOrder ?? item.presentationOrder) + 1,
      }));
    const itemId = randomUUID();
    const data = {
      version: 1 as const,
      operation: "activity_added" as const,
      itemId,
      topicId: topic.topicId,
      topicName: topic.topicName,
      subjectName: topic.subjectName,
      activityType,
      previousScheduled: false as const,
      scheduled: true as const,
      previousOrder: null,
      newOrder,
      previousDurationMinutes: null,
      newDurationMinutes: plannedDurationMinutes,
      shiftedItems,
    };

    try {
      const result = await recordManualChange({
        candidateId,
        planId,
        planItemId: itemId,
        idempotencyKey: headersResult.data["idempotency-key"],
        data,
        operationFingerprintPayload: {
          operation: "activity_added",
          topicId,
          activityType,
          plannedDurationMinutes,
          presentationOrder: presentationOrder ?? null,
        },
      });
      return sendManualChange(reply, candidateId, planId, result);
    } catch (error) {
      const mapped = manualChangeError(error, reply);
      if (mapped) return mapped;
      if (error instanceof Error && error.message === "DAILY_PLAN_MANUAL_CHANGE_TOPIC_INVALID") {
        return reply.status(400).send({ error: "TOPIC_NOT_IN_CANDIDATE_EDITAL" });
      }
      throw error;
    }
  });

  app.get("/api/study-plans/current", async (request, reply) => {
    const queryResult = z.object({}).strict().safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({ error: "INVALID_INPUT", details: queryResult.error.flatten() });
    }

    const result = await getCurrentPlan(request.candidateId!, localStudyDate(new Date()));
    return reply.send(result ? serializePlan(result, true, true) : { plan: null, items: [] });
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
