import { and, asc, desc, eq, gte, inArray, lte, max, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  dailyPlanItemEvents,
  dailyStudyPlanItems,
  dailyStudyPlans,
  studySessions,
} from "../db/schema.js";
import type {
  DailyStudyPlanListFilters,
  DailyStudyPlanListResult,
  DailyStudyPlanStore,
  DailyStudyPlanWithItems,
} from "./daily-study-plan.service.js";
import {
  parseVersionedManualPlanChange,
  projectDailyPlanPersonalization,
} from "./daily-plan-manual-change.js";

async function enrichPlanItems(
  candidateId: string,
  planId: string,
  items: DailyStudyPlanWithItems["items"],
): Promise<DailyStudyPlanWithItems["items"]> {
  if (items.length === 0) return items;

  const itemIds = items.map((item) => item.id);
  const itemIdSet = new Set(itemIds);
  const [sessionAggregates, events] = await Promise.all([
    db
      .select({
        planItemId: studySessions.studyPlanItemId,
        sessionCount: sql<number>`count(*)::int`,
        executedMinutes: sql<string>`coalesce(sum(${studySessions.durationMinutes}), 0)::text`,
        lastSessionAt: max(studySessions.studiedAt),
      })
      .from(studySessions)
      .where(and(
        eq(studySessions.candidateId, candidateId),
        inArray(studySessions.studyPlanItemId, itemIds),
      ))
      .groupBy(studySessions.studyPlanItemId),
    db
      .select({
        id: dailyPlanItemEvents.id,
        planItemId: dailyPlanItemEvents.planItemId,
        eventType: dailyPlanItemEvents.eventType,
        occurredAt: dailyPlanItemEvents.occurredAt,
        data: dailyPlanItemEvents.data,
      })
      .from(dailyPlanItemEvents)
      .where(and(
        eq(dailyPlanItemEvents.candidateId, candidateId),
        eq(dailyPlanItemEvents.planId, planId),
      ))
      .orderBy(asc(dailyPlanItemEvents.occurredAt), asc(dailyPlanItemEvents.id)),
  ]);

  const aggregateByItem = new Map(sessionAggregates.map((row) => [row.planItemId!, row]));
  const eventsByItem = new Map<string, typeof events>();
  for (const event of events) {
    const change = event.eventType === "manual_change"
      ? parseVersionedManualPlanChange(event.data)
      : undefined;
    const affectedItemIds = change?.operation === "reorder"
      ? change.changes.map((entry) => entry.itemId)
      : change?.operation === "activity_added"
        ? [change.itemId, ...(change.shiftedItems ?? []).map((entry) => entry.itemId)]
      : change ? [change.itemId] : [event.planItemId];
    for (const affectedItemId of new Set(affectedItemIds)) {
      if (!itemIdSet.has(affectedItemId)) continue;
      const list = eventsByItem.get(affectedItemId) ?? [];
      list.push(event);
      eventsByItem.set(affectedItemId, list);
    }
  }

  const personalizationByItem = projectDailyPlanPersonalization(items, events);

  const enrichedItems = items.map((item) => {
    const aggregate = aggregateByItem.get(item.id);
    const executedMinutes = Number(aggregate?.executedMinutes ?? 0);
    const sessionCount = aggregate?.sessionCount ?? 0;
    const itemEvents = eventsByItem.get(item.id) ?? [];
    const terminalEvent = [...itemEvents].reverse().find(
      (event) => event.eventType === "completed"
        || event.eventType === "ignored"
        || event.eventType === "replaced",
    );
    const status: "not_started" | "in_progress" | "completed" | "ignored" | "replaced" = terminalEvent?.eventType === "completed"
      ? "completed"
      : terminalEvent?.eventType === "ignored"
        ? "ignored"
        : terminalEvent?.eventType === "replaced"
          ? "replaced"
          : sessionCount > 0
            ? "in_progress"
            : "not_started";

    return {
      ...item,
      personalization: personalizationByItem.get(item.id)!,
      execution: {
        executedMinutes,
        sessionCount,
        recommendedTimePercent: executedMinutes / item.recommendedDurationMinutes * 100,
        status,
        lastSessionAt: aggregate?.lastSessionAt ?? null,
        events: itemEvents.map(({ id, eventType, occurredAt, data }) => ({
          id,
          eventType,
          occurredAt,
          data,
        })),
      },
    };
  });
  return enrichedItems.sort((left, right) => {
    const leftState = left.personalization!;
    const rightState = right.personalization!;
    if (leftState.isScheduled !== rightState.isScheduled) return leftState.isScheduled ? -1 : 1;
    return (leftState.presentationOrder ?? left.presentationOrder)
      - (rightState.presentationOrder ?? right.presentationOrder);
  });
}

export async function getCurrentDailyStudyPlan(
  candidateId: string,
  planDate: string,
): Promise<DailyStudyPlanWithItems | undefined> {
  const [plan] = await db
    .select()
    .from(dailyStudyPlans)
    .where(and(
      eq(dailyStudyPlans.candidateId, candidateId),
      eq(dailyStudyPlans.planDate, planDate),
    ))
    .orderBy(desc(dailyStudyPlans.version))
    .limit(1);
  if (!plan) return undefined;

  const items = await db
    .select()
    .from(dailyStudyPlanItems)
    .where(and(
      eq(dailyStudyPlanItems.candidateId, candidateId),
      eq(dailyStudyPlanItems.planId, plan.id),
    ))
    .orderBy(dailyStudyPlanItems.presentationOrder);
  return { plan, items: await enrichPlanItems(candidateId, plan.id, items) };
}

export async function listDailyStudyPlans(
  candidateId: string,
  filters: DailyStudyPlanListFilters,
): Promise<DailyStudyPlanListResult> {
  const conditions = [eq(dailyStudyPlans.candidateId, candidateId)];
  if (filters.from) conditions.push(gte(dailyStudyPlans.planDate, filters.from));
  if (filters.to) conditions.push(lte(dailyStudyPlans.planDate, filters.to));
  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(dailyStudyPlans)
    .where(where);
  const plans = await db
    .select({
      id: dailyStudyPlans.id,
      planDate: dailyStudyPlans.planDate,
      availableMinutes: dailyStudyPlans.availableMinutes,
      version: dailyStudyPlans.version,
      generatedAt: dailyStudyPlans.generatedAt,
      itemCount: sql<number>`count(${dailyStudyPlanItems.id})::int`,
    })
    .from(dailyStudyPlans)
    .leftJoin(dailyStudyPlanItems, and(
      eq(dailyStudyPlanItems.planId, dailyStudyPlans.id),
      eq(dailyStudyPlanItems.candidateId, dailyStudyPlans.candidateId),
    ))
    .where(where)
    .groupBy(dailyStudyPlans.id)
    .orderBy(desc(dailyStudyPlans.planDate), desc(dailyStudyPlans.version))
    .limit(filters.limit)
    .offset((filters.page - 1) * filters.limit);

  return {
    plans,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

export async function getDailyStudyPlanDetails(
  candidateId: string,
  planId: string,
): Promise<DailyStudyPlanWithItems | undefined> {
  const [plan] = await db
    .select()
    .from(dailyStudyPlans)
    .where(and(
      eq(dailyStudyPlans.id, planId),
      eq(dailyStudyPlans.candidateId, candidateId),
    ))
    .limit(1);
  if (!plan) return undefined;

  const items = await db
    .select()
    .from(dailyStudyPlanItems)
    .where(and(
      eq(dailyStudyPlanItems.planId, plan.id),
      eq(dailyStudyPlanItems.candidateId, candidateId),
    ))
    .orderBy(dailyStudyPlanItems.presentationOrder);
  return { plan, items: await enrichPlanItems(candidateId, plan.id, items) };
}

export const dailyStudyPlanStore: DailyStudyPlanStore = {
  transaction(operation) {
    return db.transaction(async (tx) => operation({
      async lockIdempotency(candidateId, key) {
        const lockName = `study-plan-idempotency:${candidateId}:${key}`;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockName}, 0))`);
      },
      async lockCandidateDate(candidateId, planDate) {
        const lockName = `study-plan-version:${candidateId}:${planDate}`;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockName}, 0))`);
      },
      async findByIdempotency(candidateId, key) {
        const [plan] = await tx
          .select()
          .from(dailyStudyPlans)
          .where(and(
            eq(dailyStudyPlans.candidateId, candidateId),
            eq(dailyStudyPlans.idempotencyKey, key),
          ))
          .limit(1);
        if (!plan) return undefined;

        const items = await tx
          .select()
          .from(dailyStudyPlanItems)
          .where(and(
            eq(dailyStudyPlanItems.candidateId, candidateId),
            eq(dailyStudyPlanItems.planId, plan.id),
          ))
          .orderBy(dailyStudyPlanItems.presentationOrder);
        return { plan, items };
      },
      async getNextVersion(candidateId, planDate) {
        const [result] = await tx
          .select({ value: max(dailyStudyPlans.version) })
          .from(dailyStudyPlans)
          .where(and(
            eq(dailyStudyPlans.candidateId, candidateId),
            eq(dailyStudyPlans.planDate, planDate),
          ));
        return (result.value ?? 0) + 1;
      },
      async insertPlan(plan) {
        const [inserted] = await tx.insert(dailyStudyPlans).values(plan).returning();
        if (!inserted) throw new Error("DAILY_STUDY_PLAN_INSERT_FAILED");
        return inserted;
      },
      async insertItems(items) {
        return tx.insert(dailyStudyPlanItems).values(items).returning();
      },
    }));
  },
};
