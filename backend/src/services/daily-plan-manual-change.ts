import { createHash } from "node:crypto";
import { z } from "zod";

const positiveInteger = z.number().int().positive();
const uuid = z.uuid();

const reorderSchema = z.object({
  version: z.literal(1),
  operation: z.literal("reorder"),
  changes: z.array(z.object({
    itemId: uuid,
    previousOrder: positiveInteger,
    newOrder: positiveInteger,
  }).strict()).min(1),
}).strict().superRefine((value, context) => {
  const ids = value.changes.map((change) => change.itemId);
  const orders = value.changes.map((change) => change.newOrder);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Item duplicado na reordenação", path: ["changes"] });
  }
  if (new Set(orders).size !== orders.length) {
    context.addIssue({ code: "custom", message: "Ordem final duplicada", path: ["changes"] });
  }
});

const durationChangedSchema = z.object({
  version: z.literal(1),
  operation: z.literal("duration_changed"),
  itemId: uuid,
  previousDurationMinutes: positiveInteger,
  newDurationMinutes: positiveInteger,
}).strict();

const activityAddedSchema = z.object({
  version: z.literal(1),
  operation: z.literal("activity_added"),
  itemId: uuid,
  topicId: uuid,
  topicName: z.string().min(1),
  subjectName: z.string().min(1),
  activityType: z.enum(["study", "review", "questions", "mixed", "maintenance"]),
  previousScheduled: z.literal(false),
  scheduled: z.literal(true),
  previousOrder: z.null(),
  newOrder: positiveInteger,
  previousDurationMinutes: z.null(),
  newDurationMinutes: positiveInteger,
  shiftedItems: z.array(z.object({
    itemId: uuid,
    previousOrder: positiveInteger,
    newOrder: positiveInteger,
  }).strict()).optional(),
}).strict();

const unscheduledSchema = z.object({
  version: z.literal(1),
  operation: z.literal("unscheduled"),
  itemId: uuid,
  previousScheduled: z.literal(true),
  scheduled: z.literal(false),
  previousOrder: positiveInteger,
  newOrder: z.null(),
}).strict();

export const manualPlanChangeSchema = z.discriminatedUnion("operation", [
  reorderSchema,
  durationChangedSchema,
  activityAddedSchema,
  unscheduledSchema,
]);

export type ManualPlanChange = z.infer<typeof manualPlanChangeSchema>;

export type ManualPlanChangeEvent = {
  id: string;
  planItemId: string;
  eventType: string;
  occurredAt: Date;
  data: Record<string, unknown> | null;
};

export type ManualPlanItem = {
  id: string;
  presentationOrder: number;
  recommendedDurationMinutes: number;
  recommendationSource: string;
  topicId?: string;
  topicName?: string;
  subjectName?: string;
  activityType?: string;
};

export type DailyPlanPersonalization = {
  presentationOrder: number | null;
  plannedDurationMinutes: number;
  isScheduled: boolean;
  isManual: boolean;
};

export function parseManualPlanChange(value: unknown): ManualPlanChange {
  return manualPlanChangeSchema.parse(value);
}

/** Legacy manual_change payloads without a version remain visible but do not alter the projection. */
export function parseVersionedManualPlanChange(value: unknown): ManualPlanChange | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("version" in value)) {
    return undefined;
  }
  return parseManualPlanChange(value);
}

export function fingerprintManualPlanChange(input: {
  planId: string;
  planItemId: string;
  data: ManualPlanChange;
}): string {
  const data = input.data.operation === "reorder"
    ? { ...input.data, changes: [...input.data.changes].sort((left, right) => left.itemId.localeCompare(right.itemId)) }
    : input.data;
  return createHash("sha256").update(JSON.stringify([
    input.planId,
    input.planItemId,
    data,
  ])).digest("hex");
}

export function fingerprintManualPlanRequest(input: {
  planId: string;
  operationPayload: unknown;
}): string {
  return createHash("sha256").update(JSON.stringify([
    input.planId,
    input.operationPayload,
  ])).digest("hex");
}

function orderedEvents(events: ManualPlanChangeEvent[]): ManualPlanChangeEvent[] {
  return [...events].sort((left, right) =>
    left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id));
}

export function projectDailyPlanPersonalization(
  items: ManualPlanItem[],
  events: ManualPlanChangeEvent[],
): Map<string, DailyPlanPersonalization> {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const terminal = new Set<string>();
  const projection = new Map(items.map((item) => [item.id, {
    presentationOrder: item.recommendationSource === "manual" ? null : item.presentationOrder,
    plannedDurationMinutes: item.recommendedDurationMinutes,
    isScheduled: item.recommendationSource !== "manual",
    isManual: item.recommendationSource === "manual",
  }] satisfies [string, DailyPlanPersonalization]));

  for (const event of orderedEvents(events)) {
    if (["completed", "ignored", "replaced"].includes(event.eventType)) {
      terminal.add(event.planItemId);
      continue;
    }
    if (event.eventType !== "manual_change") continue;
    const change = parseVersionedManualPlanChange(event.data);
    if (!change) continue;

    const assertMutable = (itemId: string) => {
      if (!itemById.has(itemId)) throw new Error("DAILY_PLAN_MANUAL_CHANGE_ITEM_NOT_FOUND");
      if (terminal.has(itemId)) throw new Error("DAILY_PLAN_MANUAL_CHANGE_TERMINAL_CONFLICT");
    };

    if (change.operation === "reorder") {
      for (const entry of change.changes) {
        assertMutable(entry.itemId);
        const current = projection.get(entry.itemId)!;
        if (!current.isScheduled || current.presentationOrder !== entry.previousOrder) {
          throw new Error("DAILY_PLAN_MANUAL_CHANGE_STALE");
        }
      }
      const changedIds = new Set(change.changes.map((entry) => entry.itemId));
      const finalOrders = items
        .filter((item) => projection.get(item.id)!.isScheduled)
        .map((item) => changedIds.has(item.id)
          ? change.changes.find((entry) => entry.itemId === item.id)!.newOrder
          : projection.get(item.id)!.presentationOrder!);
      if (new Set(finalOrders).size !== finalOrders.length) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_ORDER_CONFLICT");
      }
      for (const entry of change.changes) {
        projection.get(entry.itemId)!.presentationOrder = entry.newOrder;
      }
      continue;
    }

    assertMutable(change.itemId);
    const current = projection.get(change.itemId)!;
    if (change.operation === "duration_changed") {
      if (!current.isScheduled || current.plannedDurationMinutes !== change.previousDurationMinutes) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_STALE");
      }
      current.plannedDurationMinutes = change.newDurationMinutes;
    } else if (change.operation === "activity_added") {
      const item = itemById.get(change.itemId)!;
      if (!current.isManual || current.isScheduled
        || item.topicId !== change.topicId
        || item.topicName !== change.topicName
        || item.subjectName !== change.subjectName
        || item.activityType !== change.activityType
        || item.recommendedDurationMinutes !== change.newDurationMinutes) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_ITEM_MISMATCH");
      }
      const shiftedItems = change.shiftedItems ?? [];
      for (const shifted of shiftedItems) {
        assertMutable(shifted.itemId);
        const state = projection.get(shifted.itemId)!;
        if (!state.isScheduled || state.presentationOrder !== shifted.previousOrder
          || shifted.newOrder !== shifted.previousOrder + 1) {
          throw new Error("DAILY_PLAN_MANUAL_CHANGE_STALE");
        }
      }
      for (const shifted of shiftedItems) {
        projection.get(shifted.itemId)!.presentationOrder = shifted.newOrder;
      }
      const occupied = [...projection.entries()].some(([id, state]) =>
        id !== change.itemId && state.isScheduled && state.presentationOrder === change.newOrder);
      if (occupied) throw new Error("DAILY_PLAN_MANUAL_CHANGE_ORDER_CONFLICT");
      current.isScheduled = true;
      current.presentationOrder = change.newOrder;
      current.plannedDurationMinutes = change.newDurationMinutes;
    } else {
      if (!current.isScheduled || current.presentationOrder !== change.previousOrder) {
        throw new Error("DAILY_PLAN_MANUAL_CHANGE_STALE");
      }
      current.isScheduled = false;
      current.presentationOrder = null;
    }
  }

  return projection;
}
