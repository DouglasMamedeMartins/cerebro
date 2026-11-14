import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseManualPlanChange,
  parseVersionedManualPlanChange,
  projectDailyPlanPersonalization,
  type ManualPlanChangeEvent,
  type ManualPlanItem,
} from "../src/services/daily-plan-manual-change.js";

const itemA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const manualItem = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const topicId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const baseItems: ManualPlanItem[] = [
  { id: itemA, presentationOrder: 1, recommendedDurationMinutes: 30, recommendationSource: "best_action" },
  { id: itemB, presentationOrder: 2, recommendedDurationMinutes: 20, recommendationSource: "additional_topic" },
  {
    id: manualItem, presentationOrder: 3, recommendedDurationMinutes: 25,
    recommendationSource: "manual", topicId, topicName: "Manual topic",
    subjectName: "Manual subject", activityType: "study",
  },
];

function event(
  id: string,
  planItemId: string,
  occurredAt: string,
  data: Record<string, unknown> | null,
  eventType = "manual_change",
): ManualPlanChangeEvent {
  return { id, planItemId, occurredAt: new Date(occurredAt), data, eventType };
}

test("manual change format strictly validates version, operation and payload", () => {
  assert.equal(parseManualPlanChange({
    version: 1,
    operation: "duration_changed",
    itemId: itemA,
    previousDurationMinutes: 30,
    newDurationMinutes: 45,
  }).operation, "duration_changed");
  assert.throws(() => parseManualPlanChange({
    version: 1, operation: "duration_changed", itemId: itemA,
    previousDurationMinutes: 30, newDurationMinutes: 45, arbitrary: true,
  }));
  assert.throws(() => parseManualPlanChange({
    version: 2, operation: "unscheduled", itemId: itemA,
    previousScheduled: true, scheduled: false, previousOrder: 1, newOrder: null,
  }));
  assert.equal(parseVersionedManualPlanChange({ field: "legacy duration" }), undefined);
});

test("projection replays events chronologically and preserves original snapshot fields", () => {
  const events = [
    event("event-4", itemB, "2026-11-12T13:00:00.000Z", {
      version: 1, operation: "unscheduled", itemId: itemB,
      previousScheduled: true, scheduled: false, previousOrder: 1, newOrder: null,
    }),
    event("event-3", manualItem, "2026-11-12T12:00:00.000Z", {
      version: 1, operation: "activity_added", itemId: manualItem, topicId,
      topicName: "Manual topic", subjectName: "Manual subject", activityType: "study",
      previousScheduled: false, scheduled: true, previousOrder: null, newOrder: 3,
      previousDurationMinutes: null, newDurationMinutes: 25,
    }),
    event("event-3b", itemB, "2026-11-12T12:30:00.000Z", {
      version: 1, operation: "duration_changed", itemId: itemB,
      previousDurationMinutes: 20, newDurationMinutes: 35,
    }),
    event("event-2", itemA, "2026-11-12T11:00:00.000Z", {
      version: 1, operation: "reorder", changes: [
        { itemId: itemA, previousOrder: 1, newOrder: 2 },
        { itemId: itemB, previousOrder: 2, newOrder: 1 },
      ],
    }),
    event("event-1", itemA, "2026-11-12T10:00:00.000Z", {
      version: 1, operation: "duration_changed", itemId: itemA,
      previousDurationMinutes: 30, newDurationMinutes: 45,
    }),
  ];

  const projection = projectDailyPlanPersonalization(baseItems, events);
  assert.deepEqual(projection.get(itemA), {
    presentationOrder: 2, plannedDurationMinutes: 45, isScheduled: true, isManual: false,
  });
  assert.deepEqual(projection.get(itemB), {
    presentationOrder: null, plannedDurationMinutes: 35, isScheduled: false, isManual: false,
  });
  assert.deepEqual(projection.get(manualItem), {
    presentationOrder: 3, plannedDurationMinutes: 25, isScheduled: true, isManual: true,
  });
  assert.equal(baseItems[0].presentationOrder, 1);
  assert.equal(baseItems[0].recommendedDurationMinutes, 30);
  assert.equal(baseItems[0].recommendationSource, "best_action");
  assert.equal(baseItems[1]?.presentationOrder, 2);
  assert.equal(baseItems[1]?.recommendedDurationMinutes, 20);
});

test("activity_added shifts the current projection without changing snapshot values", () => {
  const change = event("add-at-two", manualItem, "2026-11-12T12:00:00.000Z", {
    version: 1,
    operation: "activity_added",
    itemId: manualItem,
    topicId,
    topicName: "Manual topic",
    subjectName: "Manual subject",
    activityType: "study",
    previousScheduled: false,
    scheduled: true,
    previousOrder: null,
    newOrder: 2,
    previousDurationMinutes: null,
    newDurationMinutes: 25,
    shiftedItems: [{ itemId: itemB, previousOrder: 2, newOrder: 3 }],
  });
  const projection = projectDailyPlanPersonalization(baseItems, [change]);
  assert.equal(projection.get(itemA)?.presentationOrder, 1);
  assert.equal(projection.get(itemB)?.presentationOrder, 3);
  assert.equal(projection.get(manualItem)?.presentationOrder, 2);
  assert.equal(baseItems[1]?.presentationOrder, 2);
  assert.equal(baseItems[1]?.recommendedDurationMinutes, 20);
});

test("later operations use the latest projection and reject stale previous values", () => {
  const prior = event("first", itemA, "2026-11-12T10:00:00.000Z", {
    version: 1, operation: "duration_changed", itemId: itemA,
    previousDurationMinutes: 30, newDurationMinutes: 40,
  });
  const later = event("second", itemA, "2026-11-12T11:00:00.000Z", {
    version: 1, operation: "duration_changed", itemId: itemA,
    previousDurationMinutes: 40, newDurationMinutes: 55,
  });
  assert.equal(projectDailyPlanPersonalization(baseItems, [later, prior]).get(itemA)?.plannedDurationMinutes, 55);

  const stale = event("stale", itemA, "2026-11-12T11:00:00.000Z", {
    version: 1, operation: "duration_changed", itemId: itemA,
    previousDurationMinutes: 30, newDurationMinutes: 55,
  });
  assert.throws(() => projectDailyPlanPersonalization(baseItems, [prior, stale]), {
    message: "DAILY_PLAN_MANUAL_CHANGE_STALE",
  });
});

test("terminal states remain terminal and block later manual changes", () => {
  const changeBeforeCompletion = event("manual-before-complete", itemA, "2026-11-12T09:00:00.000Z", {
    version: 1, operation: "duration_changed", itemId: itemA,
    previousDurationMinutes: 30, newDurationMinutes: 35,
  });
  const completion = event("complete", itemA, "2026-11-12T10:00:00.000Z", null, "completed");
  const projection = projectDailyPlanPersonalization(baseItems, [completion, changeBeforeCompletion]);
  assert.equal(projection.get(itemA)?.isScheduled, true);
  assert.equal(projection.get(itemA)?.plannedDurationMinutes, 35);

  const attemptedReopen = event("manual-after-complete", itemA, "2026-11-12T11:00:00.000Z", {
    version: 1, operation: "unscheduled", itemId: itemA,
    previousScheduled: true, scheduled: false, previousOrder: 1, newOrder: null,
  });
  assert.throws(() => projectDailyPlanPersonalization(baseItems, [completion, attemptedReopen, changeBeforeCompletion]), {
    message: "DAILY_PLAN_MANUAL_CHANGE_TERMINAL_CONFLICT",
  });
});
