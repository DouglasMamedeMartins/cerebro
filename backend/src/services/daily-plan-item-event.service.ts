import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  candidates,
  dailyPlanItemEvents,
  dailyStudyPlanItems,
  dailyStudyPlans,
  subjects,
  topics,
} from "../db/schema.js";

export type DailyPlanItemDecision = "completed" | "ignored" | "replaced";

export type RecordDailyPlanItemDecisionInput = {
  candidateId: string;
  planId: string;
  planItemId: string;
  eventType: DailyPlanItemDecision;
  idempotencyKey: string;
  replacementTopicId?: string;
};

export type RecordDailyPlanItemDecisionResult = {
  event: typeof dailyPlanItemEvents.$inferSelect;
  replayed: boolean;
};

function fingerprint(input: RecordDailyPlanItemDecisionInput): string {
  return createHash("sha256").update(JSON.stringify([
    input.planId,
    input.planItemId,
    input.eventType,
    input.replacementTopicId ?? null,
  ])).digest("hex");
}

export async function recordDailyPlanItemDecision(
  input: RecordDailyPlanItemDecisionInput,
): Promise<RecordDailyPlanItemDecisionResult> {
  const requestFingerprint = fingerprint(input);

  return db.transaction(async (tx) => {
    const lockName = `daily-plan-item-event-idempotency:${input.candidateId}:${input.idempotencyKey}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockName}, 0))`);

    const [existing] = await tx
      .select()
      .from(dailyPlanItemEvents)
      .where(and(
        eq(dailyPlanItemEvents.candidateId, input.candidateId),
        eq(dailyPlanItemEvents.idempotencyKey, input.idempotencyKey),
      ))
      .limit(1);

    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new Error("DAILY_PLAN_ITEM_EVENT_IDEMPOTENCY_CONFLICT");
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

    const [item] = await tx
      .select({ id: dailyStudyPlanItems.id })
      .from(dailyStudyPlanItems)
      .where(and(
        eq(dailyStudyPlanItems.id, input.planItemId),
        eq(dailyStudyPlanItems.planId, input.planId),
        eq(dailyStudyPlanItems.candidateId, input.candidateId),
      ))
      .for("update")
      .limit(1);
    if (!item) throw new Error("STUDY_PLAN_ITEM_NOT_FOUND");

    const [terminal] = await tx
      .select({ id: dailyPlanItemEvents.id })
      .from(dailyPlanItemEvents)
      .where(and(
        eq(dailyPlanItemEvents.planItemId, input.planItemId),
        eq(dailyPlanItemEvents.candidateId, input.candidateId),
        inArray(dailyPlanItemEvents.eventType, ["completed", "ignored", "replaced"]),
      ))
      .limit(1);
    if (terminal) throw new Error("DAILY_PLAN_ITEM_ALREADY_DECIDED");

    const [latestItemEvent] = await tx
      .select({ occurredAt: dailyPlanItemEvents.occurredAt })
      .from(dailyPlanItemEvents)
      .where(and(
        eq(dailyPlanItemEvents.planItemId, input.planItemId),
        eq(dailyPlanItemEvents.candidateId, input.candidateId),
      ))
      .orderBy(desc(dailyPlanItemEvents.occurredAt), desc(dailyPlanItemEvents.id))
      .limit(1);
    const occurredAt = new Date(Math.max(
      Date.now(),
      (latestItemEvent?.occurredAt.getTime() ?? 0) + 1,
    ));

    let data: Record<string, unknown> | null = null;
    if (input.eventType === "replaced") {
      if (!input.replacementTopicId) throw new Error("REPLACEMENT_TOPIC_REQUIRED");

      const [replacementTopic] = await tx
        .select({
          topicId: topics.id,
          topicName: topics.name,
          subjectId: subjects.id,
          subjectName: subjects.name,
          editalVersionId: subjects.editalVersionId,
        })
        .from(topics)
        .innerJoin(subjects, eq(topics.subjectId, subjects.id))
        .innerJoin(candidates, and(
          eq(candidates.id, input.candidateId),
          eq(candidates.editalVersionId, subjects.editalVersionId),
        ))
        .where(eq(topics.id, input.replacementTopicId))
        .limit(1);

      if (!replacementTopic) throw new Error("REPLACEMENT_TOPIC_NOT_IN_CANDIDATE_EDITAL");
      data = {
        replacementTopicId: replacementTopic.topicId,
        replacementTopicName: replacementTopic.topicName,
        replacementSubjectId: replacementTopic.subjectId,
        replacementSubjectName: replacementTopic.subjectName,
        editalVersionId: replacementTopic.editalVersionId,
      };
    }

    const [event] = await tx
      .insert(dailyPlanItemEvents)
      .values({
        candidateId: input.candidateId,
        planId: input.planId,
        planItemId: input.planItemId,
        eventType: input.eventType,
        occurredAt,
        data,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
      })
      .returning();
    if (!event) throw new Error("DAILY_PLAN_ITEM_EVENT_INSERT_FAILED");

    return { event, replayed: false };
  });
}
