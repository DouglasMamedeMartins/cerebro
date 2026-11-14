import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/index.js";
import {
  candidates,
  dailyPlanItemEvents,
  dailyStudyPlanItems,
  dailyStudyPlans,
  subjects,
  topics,
} from "../db/schema.js";
import {
  fingerprintManualPlanChange,
  fingerprintManualPlanRequest,
  parseManualPlanChange,
  projectDailyPlanPersonalization,
} from "./daily-plan-manual-change.js";

export type RecordDailyPlanManualChangeInput = {
  candidateId: string;
  planId: string;
  planItemId: string;
  idempotencyKey: string;
  data: unknown;
  operationFingerprintPayload?: unknown;
};

export type RecordDailyPlanManualChangeResult = {
  event: typeof dailyPlanItemEvents.$inferSelect;
  replayed: boolean;
};

export async function getCandidateManualActivityTopic(candidateId: string, topicId: string) {
  const [candidateTopic] = await db
    .select({
      topicId: topics.id,
      topicName: topics.name,
      subjectName: subjects.name,
    })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .innerJoin(candidates, and(
      eq(candidates.id, candidateId),
      eq(candidates.editalVersionId, subjects.editalVersionId),
    ))
    .where(eq(topics.id, topicId))
    .limit(1);
  return candidateTopic;
}

export async function recordDailyPlanManualChange(
  input: RecordDailyPlanManualChangeInput,
): Promise<RecordDailyPlanManualChangeResult> {
  const idempotencyKey = z.uuid().parse(input.idempotencyKey);
  const data = parseManualPlanChange(input.data);
  const requestFingerprint = input.operationFingerprintPayload === undefined
    ? fingerprintManualPlanChange({ planId: input.planId, planItemId: input.planItemId, data })
    : fingerprintManualPlanRequest({ planId: input.planId, operationPayload: input.operationFingerprintPayload });

  return db.transaction(async (tx) => {
    const planLock = `daily-plan-manual-change:${input.candidateId}:${input.planId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${planLock}, 0))`);
    const idempotencyLock = `daily-plan-manual-idempotency:${input.candidateId}:${idempotencyKey}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLock}, 0))`);

    const [existing] = await tx
      .select()
      .from(dailyPlanItemEvents)
      .where(and(
        eq(dailyPlanItemEvents.candidateId, input.candidateId),
        eq(dailyPlanItemEvents.idempotencyKey, idempotencyKey),
      ))
      .limit(1);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_IDEMPOTENCY_CONFLICT");
      }
      return { event: existing, replayed: true };
    }

    const [plan] = await tx
      .select({ id: dailyStudyPlans.id })
      .from(dailyStudyPlans)
      .where(and(
        eq(dailyStudyPlans.id, input.planId),
        eq(dailyStudyPlans.candidateId, input.candidateId),
      ))
      .limit(1);
    if (!plan) throw new Error("STUDY_PLAN_NOT_FOUND");

    const [candidate] = await tx
      .select({ editalVersionId: candidates.editalVersionId })
      .from(candidates)
      .where(eq(candidates.id, input.candidateId))
      .limit(1);
    if (!candidate) throw new Error("CANDIDATE_NOT_FOUND");

    const planItems = await tx
      .select()
      .from(dailyStudyPlanItems)
      .where(and(
        eq(dailyStudyPlanItems.planId, input.planId),
        eq(dailyStudyPlanItems.candidateId, input.candidateId),
      ))
      .orderBy(asc(dailyStudyPlanItems.id));
    let priorEvents = await tx
      .select({
        id: dailyPlanItemEvents.id,
        planItemId: dailyPlanItemEvents.planItemId,
        eventType: dailyPlanItemEvents.eventType,
        occurredAt: dailyPlanItemEvents.occurredAt,
        data: dailyPlanItemEvents.data,
      })
      .from(dailyPlanItemEvents)
      .where(and(
        eq(dailyPlanItemEvents.planId, input.planId),
        eq(dailyPlanItemEvents.candidateId, input.candidateId),
      ))
      .orderBy(asc(dailyPlanItemEvents.occurredAt), asc(dailyPlanItemEvents.id));

    if (data.operation === "activity_added") {
      if (data.itemId !== input.planItemId || planItems.some((item) => item.id === data.itemId)) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_ITEM_CONFLICT");
      }
      if (!candidate.editalVersionId) throw new Error("CANDIDATE_WITHOUT_EDITAL");
      const affectedIds = data.shiftedItems?.map((entry) => entry.itemId) ?? [];
      const lockedItems = affectedIds.length === 0 ? [] : await tx
        .select({ id: dailyStudyPlanItems.id })
        .from(dailyStudyPlanItems)
        .where(and(
          eq(dailyStudyPlanItems.planId, input.planId),
          eq(dailyStudyPlanItems.candidateId, input.candidateId),
          inArray(dailyStudyPlanItems.id, [...affectedIds].sort()),
        ))
        .orderBy(asc(dailyStudyPlanItems.id))
        .for("update");
      if (lockedItems.length !== new Set(affectedIds).size) {
        throw new Error("STUDY_PLAN_ITEM_NOT_FOUND");
      }
      priorEvents = await tx
        .select({
          id: dailyPlanItemEvents.id,
          planItemId: dailyPlanItemEvents.planItemId,
          eventType: dailyPlanItemEvents.eventType,
          occurredAt: dailyPlanItemEvents.occurredAt,
          data: dailyPlanItemEvents.data,
        })
        .from(dailyPlanItemEvents)
        .where(and(
          eq(dailyPlanItemEvents.planId, input.planId),
          eq(dailyPlanItemEvents.candidateId, input.candidateId),
        ))
        .orderBy(asc(dailyPlanItemEvents.occurredAt), asc(dailyPlanItemEvents.id));
      const terminalItemIds = new Set(priorEvents
        .filter((event) => ["completed", "ignored", "replaced"].includes(event.eventType))
        .map((event) => event.planItemId));
      if (affectedIds.some((id) => terminalItemIds.has(id))) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_TERMINAL_CONFLICT");
      }
      const [topic] = await tx
        .select({
          topicId: topics.id,
          topicName: topics.name,
          subjectId: subjects.id,
          subjectName: subjects.name,
        })
        .from(topics)
        .innerJoin(subjects, eq(topics.subjectId, subjects.id))
        .where(and(
          eq(topics.id, data.topicId),
          eq(subjects.editalVersionId, candidate.editalVersionId),
        ))
        .limit(1);
      if (!topic || topic.topicName !== data.topicName || topic.subjectName !== data.subjectName) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_TOPIC_INVALID");
      }

      const occupied = projectDailyPlanPersonalization(planItems, priorEvents);
      const expectedShifted = planItems
        .filter((item) => {
          const state = occupied.get(item.id);
          return state?.isScheduled && state.presentationOrder! >= data.newOrder;
        })
        .map((item) => ({
          itemId: item.id,
          previousOrder: occupied.get(item.id)!.presentationOrder!,
          newOrder: occupied.get(item.id)!.presentationOrder! + 1,
        }))
        .sort((left, right) => left.itemId.localeCompare(right.itemId));
      const suppliedShifted = [...(data.shiftedItems ?? [])]
        .sort((left, right) => left.itemId.localeCompare(right.itemId));
      if (expectedShifted.length !== suppliedShifted.length
        || expectedShifted.some((expected, index) => {
          const supplied = suppliedShifted[index];
          return !supplied || expected.itemId !== supplied.itemId
            || expected.previousOrder !== supplied.previousOrder
            || expected.newOrder !== supplied.newOrder;
        })) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_STALE");
      }
      if (expectedShifted.some(({ itemId }) => terminalItemIds.has(itemId))) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_TERMINAL_CONFLICT");
      }
      for (const shifted of data.shiftedItems ?? []) {
        const current = occupied.get(shifted.itemId);
        if (!current?.isScheduled || current.presentationOrder !== shifted.previousOrder
          || shifted.newOrder !== shifted.previousOrder + 1) {
          throw new Error("DAILY_PLAN_MANUAL_CHANGE_STALE");
        }
      }
      const duplicateActivity = planItems.some((item) => {
        const state = occupied.get(item.id);
        return state?.isScheduled && item.topicId === data.topicId && item.activityType === data.activityType;
      });
      if (duplicateActivity) throw new Error("DAILY_PLAN_MANUAL_CHANGE_DUPLICATE_ACTIVITY");
      const shiftedIds = new Set((data.shiftedItems ?? []).map((entry) => entry.itemId));
      if ([...occupied.entries()].some(([id, state]) => state.isScheduled
        && id !== data.itemId && !shiftedIds.has(id) && state.presentationOrder === data.newOrder)) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_ORDER_CONFLICT");
      }
      const [lastOrder] = await tx
        .select({ value: max(dailyStudyPlanItems.presentationOrder) })
        .from(dailyStudyPlanItems)
        .where(eq(dailyStudyPlanItems.planId, input.planId));
      await tx.insert(dailyStudyPlanItems).values({
        id: data.itemId,
        planId: input.planId,
        candidateId: input.candidateId,
        presentationOrder: (lastOrder.value ?? 0) + 1,
        rankingPosition: null,
        topicId: topic.topicId,
        topicName: topic.topicName,
        subjectName: topic.subjectName,
        activityType: data.activityType,
        recommendedDurationMinutes: data.newDurationMinutes,
        priorityLevel: "low",
        priorityScore: 0,
        reason: ["manual"],
        explanation: "Atividade adicionada manualmente pelo candidato.",
        expectedImpact: "Definido pelo candidato.",
        recommendationSource: "manual",
      });
      planItems.push({
        id: data.itemId,
        planId: input.planId,
        candidateId: input.candidateId,
        presentationOrder: (lastOrder.value ?? 0) + 1,
        rankingPosition: null,
        topicId: topic.topicId,
        topicName: topic.topicName,
        subjectName: topic.subjectName,
        activityType: data.activityType,
        recommendedDurationMinutes: data.newDurationMinutes,
        priorityLevel: "low",
        priorityScore: 0,
        reason: ["manual"],
        explanation: "Atividade adicionada manualmente pelo candidato.",
        expectedImpact: "Definido pelo candidato.",
        recommendationSource: "manual",
      });
    } else {
      const affectedIds = data.operation === "reorder"
        ? data.changes.map((change) => change.itemId)
        : [data.itemId];
      if (!affectedIds.includes(input.planItemId)) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_ITEM_MISMATCH");
      }
      const lockedItems = await tx
        .select({ id: dailyStudyPlanItems.id })
        .from(dailyStudyPlanItems)
        .where(and(
          eq(dailyStudyPlanItems.planId, input.planId),
          eq(dailyStudyPlanItems.candidateId, input.candidateId),
          inArray(dailyStudyPlanItems.id, [...affectedIds].sort()),
        ))
        .orderBy(asc(dailyStudyPlanItems.id))
        .for("update");
      if (lockedItems.length !== new Set(affectedIds).size) {
        throw new Error("STUDY_PLAN_ITEM_NOT_FOUND");
      }
      // Read terminal decisions after the row locks so a concurrent decision cannot race this write.
      priorEvents = await tx
        .select({
          id: dailyPlanItemEvents.id,
          planItemId: dailyPlanItemEvents.planItemId,
          eventType: dailyPlanItemEvents.eventType,
          occurredAt: dailyPlanItemEvents.occurredAt,
          data: dailyPlanItemEvents.data,
        })
        .from(dailyPlanItemEvents)
        .where(and(
          eq(dailyPlanItemEvents.planId, input.planId),
          eq(dailyPlanItemEvents.candidateId, input.candidateId),
        ))
        .orderBy(asc(dailyPlanItemEvents.occurredAt), asc(dailyPlanItemEvents.id));

      if (data.operation === "reorder") {
        const current = projectDailyPlanPersonalization(planItems, priorEvents);
        const terminalItemIds = new Set(priorEvents
          .filter((event) => ["completed", "ignored", "replaced"].includes(event.eventType))
          .map((event) => event.planItemId));
        const expectedIds = planItems
          .filter((item) => current.get(item.id)?.isScheduled && !terminalItemIds.has(item.id))
          .map((item) => item.id)
          .sort();
        const suppliedIds = [...affectedIds].sort();
        if (expectedIds.length === 0 || expectedIds.length !== suppliedIds.length
          || expectedIds.some((id, index) => id !== suppliedIds[index])) {
          throw new Error("DAILY_PLAN_MANUAL_CHANGE_REORDER_SET_MISMATCH");
        }
        const expectedSlots = expectedIds
          .map((id) => current.get(id)!.presentationOrder!)
          .sort((left, right) => left - right);
        const suppliedSlots = data.changes.map((change) => change.newOrder).sort((left, right) => left - right);
        if (expectedSlots.length !== suppliedSlots.length
          || expectedSlots.some((order, index) => order !== suppliedSlots[index])) {
          throw new Error("DAILY_PLAN_MANUAL_CHANGE_REORDER_SET_MISMATCH");
        }
      }
    }

    const nextEvent = {
      id: idempotencyKey,
      planItemId: input.planItemId,
      eventType: "manual_change",
      occurredAt: new Date(Math.max(Date.now(), ...priorEvents.map((event) => event.occurredAt.getTime() + 1))),
      data: data as unknown as Record<string, unknown>,
    };
    projectDailyPlanPersonalization(planItems, [...priorEvents, nextEvent]);

    const [event] = await tx
      .insert(dailyPlanItemEvents)
      .values({
        candidateId: input.candidateId,
        planId: input.planId,
        planItemId: input.planItemId,
        eventType: "manual_change",
        occurredAt: nextEvent.occurredAt,
        data: data as unknown as Record<string, unknown>,
        idempotencyKey,
        requestFingerprint,
      })
      .returning();
    if (!event) throw new Error("DAILY_PLAN_MANUAL_CHANGE_INSERT_FAILED");
    return { event, replayed: false };
  });
}
