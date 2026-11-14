import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  candidates,
  dailyPlanItemEvents,
  dailyStudyPlanItems,
  dailyStudyPlans,
  editalVersions,
  studySessions,
  subjects,
  topics,
} from "../src/db/schema.js";

const candidateA = randomUUID();
const candidateB = randomUUID();
const planA = randomUUID();
const planB = randomUUID();
const topicA = randomUUID();
const topicB = randomUUID();
const foreignItemId = randomUUID();
const itemIds = Array.from({ length: 7 }, () => randomUUID());

let closeDatabase: (() => Promise<void>) | undefined;
test.after(async () => closeDatabase?.());

test("PostgreSQL execution projection aggregates all candidate sessions and ordered events", {
  skip: process.env.PMDF_EXECUTION_INTEGRATION !== "1",
}, async () => {
  const [{ db }, { getDailyStudyPlanDetails }] = await Promise.all([
    import("../src/db/index.js"),
    import("../src/services/daily-study-plan.store.js"),
  ]);
  closeDatabase = () => db.$client.end();
  const editalId = randomUUID();
  const subjectId = randomUUID();
  const subjectBId = randomUUID();
  const now = new Date("2026-11-12T14:30:00.000Z");

  await db.insert(candidates).values([
    { id: candidateA, name: "Synthetic A", email: `${candidateA}@example.test` },
    { id: candidateB, name: "Synthetic B", email: `${candidateB}@example.test` },
  ]);
  await db.insert(editalVersions).values({ id: editalId, title: "Synthetic", version: 1 });
  await db.insert(subjects).values([
    { id: subjectId, editalVersionId: editalId, name: "Synthetic A" },
    { id: subjectBId, editalVersionId: editalId, name: "Synthetic B" },
  ]);
  await db.insert(topics).values([
    { id: topicA, subjectId, name: "Synthetic topic A" },
    { id: topicB, subjectId: subjectBId, name: "Synthetic topic B" },
  ]);
  await db.insert(dailyStudyPlans).values([
    { id: planA, candidateId: candidateA, planDate: "2026-11-12", timeZone: "America/Sao_Paulo", availableMinutes: 210, version: 1, idempotencyKey: randomUUID() },
    { id: planB, candidateId: candidateB, planDate: "2026-11-12", timeZone: "America/Sao_Paulo", availableMinutes: 30, version: 1, idempotencyKey: randomUUID() },
  ]);
  await db.insert(dailyStudyPlanItems).values([
    ...itemIds.map((id, index) => ({
      id,
      planId: planA,
      candidateId: candidateA,
      presentationOrder: index + 1,
      rankingPosition: index + 1,
      topicId: topicA,
      topicName: `Snapshot topic ${index + 1}`,
      subjectName: "Snapshot subject",
      activityType: "study",
      recommendedDurationMinutes: 30,
      priorityLevel: "high",
      priorityScore: 80,
      reason: ["synthetic"],
      explanation: `Snapshot explanation ${index + 1}`,
      expectedImpact: `Snapshot impact ${index + 1}`,
      recommendationSource: "best_action",
    })),
    {
      id: foreignItemId,
      planId: planB,
      candidateId: candidateB,
      presentationOrder: 1,
      rankingPosition: 1,
      topicId: topicB,
      topicName: "Foreign synthetic topic",
      subjectName: "Foreign snapshot subject",
      activityType: "study",
      recommendedDurationMinutes: 30,
      priorityLevel: "high",
      priorityScore: 80,
      reason: ["synthetic"],
      explanation: "Foreign snapshot",
      expectedImpact: "Foreign impact",
      recommendationSource: "best_action",
    },
  ]);
  await db.insert(studySessions).values([
    { candidateId: candidateA, topicId: topicA, studyPlanItemId: itemIds[1], durationMinutes: 12, studiedAt: new Date("2026-11-12T10:00:00.000Z") },
    { candidateId: candidateA, topicId: topicA, studyPlanItemId: itemIds[2], durationMinutes: 25, studiedAt: new Date("2026-11-12T11:00:00.000Z") },
    { candidateId: candidateA, topicId: topicA, studyPlanItemId: itemIds[2], durationMinutes: 20, studiedAt: now },
    { candidateId: candidateA, topicId: topicA, studyPlanItemId: itemIds[3], durationMinutes: 40, studiedAt: now },
    { candidateId: candidateA, topicId: topicA, studyPlanItemId: itemIds[4], durationMinutes: 8, studiedAt: now },
    { candidateId: candidateA, topicId: topicA, studyPlanItemId: itemIds[5], durationMinutes: 5, studiedAt: now },
    { candidateId: candidateB, topicId: topicB, studyPlanItemId: foreignItemId, durationMinutes: 99, studiedAt: now },
  ]);
  await db.insert(dailyPlanItemEvents).values([
    { candidateId: candidateA, planId: planA, planItemId: itemIds[3], eventType: "ignored", occurredAt: new Date("2026-11-12T12:00:00.000Z"), data: { reason: "synthetic" } },
    { candidateId: candidateA, planId: planA, planItemId: itemIds[4], eventType: "replaced", occurredAt: new Date("2026-11-12T12:01:00.000Z"), data: { replacement: "synthetic activity" } },
    { candidateId: candidateA, planId: planA, planItemId: itemIds[5], eventType: "manual_change", occurredAt: new Date("2026-11-12T12:02:00.000Z"), data: { field: "duration" } },
    { candidateId: candidateB, planId: planB, planItemId: foreignItemId, eventType: "ignored", occurredAt: now },
  ]);

  const projection = await getDailyStudyPlanDetails(candidateA, planA);
  assert.ok(projection);
  assert.equal(projection.items.length, 7);

  const [empty, one, partials, ignored, replaced, manual, noEvents] = projection.items;
  assert.deepEqual(empty.execution, {
    executedMinutes: 0, sessionCount: 0, recommendedTimePercent: 0,
    status: "not_started", lastSessionAt: null, events: [],
  });
  assert.equal(one.execution.executedMinutes, 12);
  assert.equal(one.execution.sessionCount, 1);
  assert.equal(one.execution.recommendedTimePercent, 40);
  assert.equal(one.execution.lastSessionAt?.toISOString(), "2026-11-12T10:00:00.000Z");
  assert.equal(partials.execution.executedMinutes, 45);
  assert.equal(partials.execution.sessionCount, 2);
  assert.equal(partials.execution.recommendedTimePercent, 150);
  assert.equal(partials.execution.status, "in_progress");
  assert.equal(partials.execution.lastSessionAt?.toISOString(), now.toISOString());
  assert.equal(ignored.execution.status, "ignored");
  assert.equal(ignored.execution.executedMinutes, 40);
  assert.equal(replaced.execution.status, "replaced");
  assert.equal(replaced.execution.executedMinutes, 8);
  assert.equal(manual.execution.status, "in_progress");
  assert.equal(manual.execution.events[0].eventType, "manual_change");
  assert.equal(noEvents.execution.events.length, 0);
  assert.deepEqual(
    [empty.topicName, empty.subjectName, empty.explanation, empty.expectedImpact],
    ["Snapshot topic 1", "Snapshot subject", "Snapshot explanation 1", "Snapshot impact 1"],
  );

  assert.equal(await getDailyStudyPlanDetails(candidateA, planB), undefined);
});

test("PostgreSQL decisions enforce idempotency, terminal state, ownership and immutability", {
  skip: process.env.PMDF_EXECUTION_INTEGRATION !== "1",
}, async () => {
  const [{ db }, { recordDailyPlanItemDecision }, { getDailyStudyPlanDetails }] = await Promise.all([
    import("../src/db/index.js"),
    import("../src/services/daily-plan-item-event.service.js"),
    import("../src/services/daily-study-plan.store.js"),
  ]);
  closeDatabase = () => db.$client.end();

  const ownerId = randomUUID();
  const otherId = randomUUID();
  const editalId = randomUUID();
  const otherEditalId = randomUUID();
  const subjectId = randomUUID();
  const otherSubjectId = randomUUID();
  const originalTopicId = randomUUID();
  const replacementTopicId = randomUUID();
  const foreignTopicId = randomUUID();
  const planId = randomUUID();
  const otherPlanId = randomUUID();
  const completeItemId = randomUUID();
  const ignoreItemId = randomUUID();
  const replaceItemId = randomUUID();
  const raceItemId = randomUUID();
  const sameKeyRaceItemId = randomUUID();
  const otherItemId = randomUUID();
  const completeKey = randomUUID();
  const crossCandidateKey = randomUUID();
  const racedIdempotencyKey = randomUUID();
  const priorSessionAt = new Date("2026-11-12T13:00:00.000Z");

  await db.insert(editalVersions).values([
    { id: editalId, title: "Decision edital", version: 1 },
    { id: otherEditalId, title: "Other edital", version: 1 },
  ]);
  await db.insert(candidates).values([
    { id: ownerId, name: "Decision owner", email: `${ownerId}@example.test`, editalVersionId: editalId },
    { id: otherId, name: "Decision other", email: `${otherId}@example.test`, editalVersionId: otherEditalId },
  ]);
  await db.insert(subjects).values([
    { id: subjectId, editalVersionId: editalId, name: "Decision subject" },
    { id: otherSubjectId, editalVersionId: otherEditalId, name: "Other subject" },
  ]);
  await db.insert(topics).values([
    { id: originalTopicId, subjectId, name: "Original topic" },
    { id: replacementTopicId, subjectId, name: "Replacement topic" },
    { id: foreignTopicId, subjectId: otherSubjectId, name: "Foreign topic" },
  ]);
  await db.insert(dailyStudyPlans).values([
    { id: planId, candidateId: ownerId, planDate: "2026-11-12", timeZone: "America/Sao_Paulo", availableMinutes: 120, version: 1, idempotencyKey: randomUUID() },
    { id: otherPlanId, candidateId: otherId, planDate: "2026-11-12", timeZone: "America/Sao_Paulo", availableMinutes: 30, version: 1, idempotencyKey: randomUUID() },
  ]);
  const ownerItems = [completeItemId, ignoreItemId, replaceItemId, raceItemId, sameKeyRaceItemId].map((id, index) => ({
    id,
    planId,
    candidateId: ownerId,
    presentationOrder: index + 1,
    rankingPosition: index + 1,
    topicId: originalTopicId,
    topicName: "Original topic snapshot",
    subjectName: "Original subject snapshot",
    activityType: "study",
    recommendedDurationMinutes: 30,
    priorityLevel: "high",
    priorityScore: 90,
    reason: ["synthetic"],
    explanation: "Immutable explanation",
    expectedImpact: "Immutable impact",
    recommendationSource: "best_action",
  }));
  await db.insert(dailyStudyPlanItems).values([
    ...ownerItems,
    {
      id: otherItemId,
      planId: otherPlanId,
      candidateId: otherId,
      presentationOrder: 1,
      rankingPosition: 1,
      topicId: foreignTopicId,
      topicName: "Other topic snapshot",
      subjectName: "Other subject snapshot",
      activityType: "study",
      recommendedDurationMinutes: 30,
      priorityLevel: "high",
      priorityScore: 90,
      reason: ["synthetic"],
      explanation: "Other immutable explanation",
      expectedImpact: "Other immutable impact",
      recommendationSource: "best_action",
    },
  ]);
  await db.insert(studySessions).values({
    candidateId: ownerId,
    topicId: originalTopicId,
    studyPlanItemId: completeItemId,
    durationMinutes: 18,
    studiedAt: priorSessionAt,
  });

  const completeInput = {
    candidateId: ownerId,
    planId,
    planItemId: completeItemId,
    eventType: "completed" as const,
    idempotencyKey: completeKey,
  };
  const completed = await recordDailyPlanItemDecision(completeInput);
  const replay = await recordDailyPlanItemDecision(completeInput);
  assert.equal(completed.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.event.id, completed.event.id);
  assert.equal(completed.event.data, null);

  await assert.rejects(
    recordDailyPlanItemDecision({ ...completeInput, eventType: "ignored", planItemId: ignoreItemId }),
    { message: "DAILY_PLAN_ITEM_EVENT_IDEMPOTENCY_CONFLICT" },
  );
  await assert.rejects(
    recordDailyPlanItemDecision({ ...completeInput, idempotencyKey: randomUUID(), eventType: "ignored" }),
    { message: "DAILY_PLAN_ITEM_ALREADY_DECIDED" },
  );
  await assert.rejects(
    recordDailyPlanItemDecision({ ...completeInput, idempotencyKey: randomUUID(), planId: randomUUID() }),
    { message: "STUDY_PLAN_NOT_FOUND" },
  );
  await assert.rejects(
    recordDailyPlanItemDecision({ ...completeInput, idempotencyKey: randomUUID(), planItemId: randomUUID() }),
    { message: "STUDY_PLAN_ITEM_NOT_FOUND" },
  );
  await assert.rejects(
    recordDailyPlanItemDecision({ ...completeInput, idempotencyKey: randomUUID(), planItemId: otherItemId }),
    { message: "STUDY_PLAN_ITEM_NOT_FOUND" },
  );
  await assert.rejects(
    recordDailyPlanItemDecision({ ...completeInput, candidateId: otherId, idempotencyKey: randomUUID() }),
    { message: "STUDY_PLAN_NOT_FOUND" },
  );

  const ignored = await recordDailyPlanItemDecision({
    ...completeInput,
    planItemId: ignoreItemId,
    eventType: "ignored",
    idempotencyKey: crossCandidateKey,
  });
  const otherCandidateSameKey = await recordDailyPlanItemDecision({
    ...completeInput,
    candidateId: otherId,
    planId: otherPlanId,
    planItemId: otherItemId,
    eventType: "ignored",
    idempotencyKey: crossCandidateKey,
  });
  assert.equal(ignored.event.eventType, "ignored");
  assert.equal(otherCandidateSameKey.event.candidateId, otherId);

  const replaced = await recordDailyPlanItemDecision({
    ...completeInput,
    planItemId: replaceItemId,
    eventType: "replaced",
    replacementTopicId,
    idempotencyKey: randomUUID(),
  });
  assert.deepEqual(replaced.event.data, {
    replacementTopicId,
    replacementTopicName: "Replacement topic",
    replacementSubjectId: subjectId,
    replacementSubjectName: "Decision subject",
    editalVersionId: editalId,
  });
  await assert.rejects(
    recordDailyPlanItemDecision({
      ...completeInput,
      planItemId: raceItemId,
      eventType: "replaced",
      replacementTopicId: foreignTopicId,
      idempotencyKey: randomUUID(),
    }),
    { message: "REPLACEMENT_TOPIC_NOT_IN_CANDIDATE_EDITAL" },
  );

  const concurrent = await Promise.allSettled([
    recordDailyPlanItemDecision({ ...completeInput, planItemId: raceItemId, idempotencyKey: randomUUID() }),
    recordDailyPlanItemDecision({ ...completeInput, planItemId: raceItemId, eventType: "ignored", idempotencyKey: randomUUID() }),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);

  const sameKeyConcurrent = await Promise.all([
    recordDailyPlanItemDecision({ ...completeInput, planItemId: sameKeyRaceItemId, idempotencyKey: racedIdempotencyKey }),
    recordDailyPlanItemDecision({ ...completeInput, planItemId: sameKeyRaceItemId, idempotencyKey: racedIdempotencyKey }),
  ]);
  assert.deepEqual(sameKeyConcurrent.map((result) => result.replayed).sort(), [false, true]);
  assert.equal(sameKeyConcurrent[0].event.id, sameKeyConcurrent[1].event.id);

  await assert.rejects(
    db.insert(dailyPlanItemEvents).values({
      candidateId: ownerId, planId, planItemId: completeItemId,
      eventType: "ignored", data: null,
    }),
  );
  await assert.rejects(
    db.insert(dailyPlanItemEvents).values({
      candidateId: ownerId, planId, planItemId: otherItemId,
      eventType: "manual_change", data: null,
    }),
  );
  await assert.rejects(
    db.update(dailyStudyPlans).set({ availableMinutes: 121 }).where(eq(dailyStudyPlans.id, planId)),
  );
  await assert.rejects(
    db.update(dailyStudyPlanItems).set({ explanation: "mutated" }).where(eq(dailyStudyPlanItems.id, completeItemId)),
  );
  await assert.rejects(
    db.update(dailyPlanItemEvents).set({ data: { mutated: true } }).where(eq(dailyPlanItemEvents.id, completed.event.id)),
  );

  const projection = await getDailyStudyPlanDetails(ownerId, planId);
  assert.ok(projection);
  const completeExecution = projection.items.find((item) => item.id === completeItemId)?.execution;
  const replaceExecution = projection.items.find((item) => item.id === replaceItemId)?.execution;
  assert.equal(completeExecution?.status, "completed");
  assert.equal(completeExecution?.executedMinutes, 18);
  assert.equal(completeExecution?.sessionCount, 1);
  assert.equal(replaceExecution?.status, "replaced");
  assert.equal(replaceExecution?.sessionCount, 0);
  assert.equal(projection.items.find((item) => item.id === completeItemId)?.explanation, "Immutable explanation");
});

test("PostgreSQL manual plan changes are idempotent, serialized and projected without mutating snapshots", {
  skip: process.env.PMDF_EXECUTION_INTEGRATION !== "1",
}, async () => {
  const [{ db }, { recordDailyPlanManualChange }, { recordDailyPlanItemDecision }, { getDailyStudyPlanDetails }, { createStudySession, getStudySessionHistory }] = await Promise.all([
    import("../src/db/index.js"),
    import("../src/services/daily-plan-manual-change.service.js"),
    import("../src/services/daily-plan-item-event.service.js"),
    import("../src/services/daily-study-plan.store.js"),
    import("../src/services/study-session.service.js"),
  ]);
  closeDatabase = () => db.$client.end();

  const candidateId = randomUUID();
  const otherCandidateId = randomUUID();
  const editalId = randomUUID();
  const otherEditalId = randomUUID();
  const subjectId = randomUUID();
  const otherSubjectId = randomUUID();
  const topicId = randomUUID();
  const manualTopicId = randomUUID();
  const positionedTopicId = randomUUID();
  const concurrentTopicId = randomUUID();
  const foreignTopicId = randomUUID();
  const planId = randomUUID();
  const otherPlanId = randomUUID();
  const firstItemId = randomUUID();
  const secondItemId = randomUUID();
  const manualItemId = randomUUID();
  const positionedItemId = randomUUID();
  const concurrentItemAId = randomUUID();
  const concurrentItemBId = randomUUID();
  const otherItemId = randomUUID();
  const priorSessionId = randomUUID();
  const reorderKey = randomUUID();
  const initialDuration = (itemId: string, presentationOrder: number) => ({
    id: itemId, planId, candidateId, presentationOrder, rankingPosition: presentationOrder,
    topicId, topicName: `Snapshot ${presentationOrder}`, subjectName: "Snapshot subject",
    activityType: "study", recommendedDurationMinutes: presentationOrder === 1 ? 30 : 20,
    priorityLevel: "high", priorityScore: 80, reason: ["snapshot"],
    explanation: `Immutable explanation ${presentationOrder}`,
    expectedImpact: `Immutable impact ${presentationOrder}`, recommendationSource: "best_action",
  });

  await db.insert(editalVersions).values([
    { id: editalId, title: "Synthetic manual", version: 1 },
    { id: otherEditalId, title: "Synthetic other edital", version: 1 },
  ]);
  await db.insert(candidates).values([
    { id: candidateId, name: "Synthetic Manual", email: `${candidateId}@example.test`, editalVersionId: editalId },
    { id: otherCandidateId, name: "Synthetic Other", email: `${otherCandidateId}@example.test`, editalVersionId: otherEditalId },
  ]);
  await db.insert(subjects).values([
    { id: subjectId, editalVersionId: editalId, name: "Synthetic subject" },
    { id: otherSubjectId, editalVersionId: otherEditalId, name: "Other synthetic subject" },
  ]);
  await db.insert(topics).values([
    { id: topicId, subjectId, name: "Snapshot topic" },
    { id: manualTopicId, subjectId, name: "Manual topic" },
    { id: positionedTopicId, subjectId, name: "Positioned topic" },
    { id: concurrentTopicId, subjectId, name: "Concurrent topic" },
    { id: foreignTopicId, subjectId: otherSubjectId, name: "Foreign topic" },
  ]);
  await db.insert(dailyStudyPlans).values([
    { id: planId, candidateId, planDate: "2026-11-13", timeZone: "America/Sao_Paulo", availableMinutes: 120, version: 1, idempotencyKey: randomUUID() },
    { id: otherPlanId, candidateId: otherCandidateId, planDate: "2026-11-13", timeZone: "America/Sao_Paulo", availableMinutes: 30, version: 1, idempotencyKey: randomUUID() },
  ]);
  await db.insert(dailyStudyPlanItems).values([
    initialDuration(firstItemId, 1), initialDuration(secondItemId, 2),
    {
      id: otherItemId, planId: otherPlanId, candidateId: otherCandidateId, presentationOrder: 1, rankingPosition: 1,
      topicId: foreignTopicId, topicName: "Other candidate snapshot", subjectName: "Other synthetic subject", activityType: "study",
      recommendedDurationMinutes: 30, priorityLevel: "high", priorityScore: 80, reason: ["snapshot"],
      explanation: "Other immutable explanation", expectedImpact: "Other immutable impact", recommendationSource: "best_action",
    },
  ]);
  await db.insert(studySessions).values({
    id: priorSessionId, candidateId, topicId, studyPlanItemId: firstItemId,
    durationMinutes: 17, studiedAt: new Date("2026-11-13T10:00:00.000Z"),
  });

  const durationChange = {
    version: 1 as const,
    operation: "duration_changed" as const,
    itemId: firstItemId,
    previousDurationMinutes: 30,
    newDurationMinutes: 45,
  };
  const durationKey = randomUUID();
  const durationInput = {
    candidateId, planId, planItemId: firstItemId, idempotencyKey: durationKey, data: durationChange,
    operationFingerprintPayload: { operation: "duration_changed", itemId: firstItemId, newDurationMinutes: 45 },
  };
  const firstWrite = await recordDailyPlanManualChange(durationInput);
  const replay = await recordDailyPlanManualChange(durationInput);
  assert.equal(firstWrite.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.event.id, firstWrite.event.id);
  await assert.rejects(recordDailyPlanManualChange({
    ...durationInput,
    data: { ...durationChange, newDurationMinutes: 50 },
    operationFingerprintPayload: { operation: "duration_changed", itemId: firstItemId, newDurationMinutes: 50 },
  }), { message: "DAILY_PLAN_MANUAL_CHANGE_IDEMPOTENCY_CONFLICT" });

  const sharedKey = randomUUID();
  const ownerShared = await recordDailyPlanManualChange({
    candidateId, planId, planItemId: firstItemId, idempotencyKey: sharedKey,
    data: { version: 1, operation: "duration_changed", itemId: firstItemId, previousDurationMinutes: 45, newDurationMinutes: 46 },
  });
  const otherShared = await recordDailyPlanManualChange({
    candidateId: otherCandidateId, planId: otherPlanId, planItemId: otherItemId, idempotencyKey: sharedKey,
    data: { version: 1, operation: "duration_changed", itemId: otherItemId, previousDurationMinutes: 30, newDurationMinutes: 35 },
  });
  assert.notEqual(ownerShared.event.id, otherShared.event.id);
  await assert.rejects(recordDailyPlanManualChange({
    candidateId, planId, planItemId: otherItemId, idempotencyKey: randomUUID(),
    data: { version: 1, operation: "duration_changed", itemId: otherItemId, previousDurationMinutes: 30, newDurationMinutes: 36 },
  }), { message: "STUDY_PLAN_ITEM_NOT_FOUND" });

  const racing = await Promise.allSettled([
    recordDailyPlanManualChange({
      candidateId, planId, planItemId: secondItemId, idempotencyKey: randomUUID(),
      data: { version: 1, operation: "duration_changed", itemId: secondItemId, previousDurationMinutes: 20, newDurationMinutes: 35 },
    }),
    recordDailyPlanManualChange({
      candidateId, planId, planItemId: secondItemId, idempotencyKey: randomUUID(),
      data: { version: 1, operation: "duration_changed", itemId: secondItemId, previousDurationMinutes: 20, newDurationMinutes: 40 },
    }),
  ]);
  assert.equal(racing.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(racing.filter((result) => result.status === "rejected").length, 1);

  const reorderData = {
    version: 1 as const,
    operation: "reorder" as const,
    changes: [
      { itemId: secondItemId, previousOrder: 2, newOrder: 1 },
      { itemId: firstItemId, previousOrder: 1, newOrder: 2 },
    ],
  };
  const reorderInput = {
    candidateId, planId, planItemId: secondItemId, idempotencyKey: reorderKey, data: reorderData,
    operationFingerprintPayload: { operation: "reorder", itemIds: [secondItemId, firstItemId] },
  };
  const reordered = await recordDailyPlanManualChange(reorderInput);
  const reorderReplay = await recordDailyPlanManualChange(reorderInput);
  assert.equal(reordered.replayed, false);
  assert.equal(reorderReplay.replayed, true);
  assert.equal(reorderReplay.event.id, reordered.event.id);

  const addedInput = {
    candidateId, planId, planItemId: manualItemId, idempotencyKey: randomUUID(),
    operationFingerprintPayload: {
      operation: "activity_added", topicId: manualTopicId, activityType: "study",
      plannedDurationMinutes: 25, presentationOrder: null,
    },
    data: {
      version: 1, operation: "activity_added", itemId: manualItemId,
      topicId: manualTopicId, topicName: "Manual topic", subjectName: "Synthetic subject",
      activityType: "study", previousScheduled: false, scheduled: true,
      previousOrder: null, newOrder: 3, previousDurationMinutes: null, newDurationMinutes: 25,
      shiftedItems: [],
    },
  };
  const added = await recordDailyPlanManualChange(addedInput);
  assert.equal(added.event.eventType, "manual_change");
  const addReplay = await recordDailyPlanManualChange({
    ...addedInput,
    planItemId: randomUUID(),
    data: { ...addedInput.data, itemId: randomUUID() },
  });
  assert.equal(addReplay.replayed, true);
  assert.equal(addReplay.event.id, added.event.id);

  const positioned = await recordDailyPlanManualChange({
    candidateId, planId, planItemId: positionedItemId, idempotencyKey: randomUUID(),
    operationFingerprintPayload: {
      operation: "activity_added", topicId: positionedTopicId, activityType: "questions",
      plannedDurationMinutes: 15, presentationOrder: 2,
    },
    data: {
      version: 1, operation: "activity_added", itemId: positionedItemId,
      topicId: positionedTopicId, topicName: "Positioned topic", subjectName: "Synthetic subject",
      activityType: "questions", previousScheduled: false, scheduled: true,
      previousOrder: null, newOrder: 2, previousDurationMinutes: null, newDurationMinutes: 15,
      shiftedItems: [
        { itemId: firstItemId, previousOrder: 2, newOrder: 3 },
        { itemId: manualItemId, previousOrder: 3, newOrder: 4 },
      ],
    },
  });
  assert.equal(positioned.event.eventType, "manual_change");

  const concurrentAdd = (itemId: string) => recordDailyPlanManualChange({
    candidateId, planId, planItemId: itemId, idempotencyKey: randomUUID(),
    operationFingerprintPayload: {
      operation: "activity_added", topicId: concurrentTopicId, activityType: "review",
      plannedDurationMinutes: 12, presentationOrder: null,
    },
    data: {
      version: 1, operation: "activity_added", itemId,
      topicId: concurrentTopicId, topicName: "Concurrent topic", subjectName: "Synthetic subject",
      activityType: "review", previousScheduled: false, scheduled: true,
      previousOrder: null, newOrder: 5, previousDurationMinutes: null, newDurationMinutes: 12,
      shiftedItems: [],
    },
  });
  const concurrentAdds = await Promise.allSettled([
    concurrentAdd(concurrentItemAId),
    concurrentAdd(concurrentItemBId),
  ]);
  assert.equal(concurrentAdds.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrentAdds.filter((result) => result.status === "rejected").length, 1);
  assert.ok(["DAILY_PLAN_MANUAL_CHANGE_DUPLICATE_ACTIVITY", "DAILY_PLAN_MANUAL_CHANGE_STALE"]
    .includes((concurrentAdds.find((result) => result.status === "rejected") as PromiseRejectedResult).reason.message));
  const duplicateRows = await db.select({ id: dailyStudyPlanItems.id })
    .from(dailyStudyPlanItems)
    .where(and(
      eq(dailyStudyPlanItems.planId, planId),
      eq(dailyStudyPlanItems.topicId, concurrentTopicId),
      eq(dailyStudyPlanItems.activityType, "review"),
    ));
  assert.equal(duplicateRows.length, 1);

  const manualSessionOne = await createStudySession({
    candidateId, topicId: manualTopicId, studyPlanItemId: manualItemId, durationMinutes: 8,
    studiedAt: "2026-11-13T12:00:00.000Z",
  }, randomUUID());
  const manualSessionTwo = await createStudySession({
    candidateId, topicId: manualTopicId, studyPlanItemId: manualItemId, durationMinutes: 11,
    studiedAt: "2026-11-13T13:00:00.000Z",
  }, randomUUID());
  assert.equal(manualSessionOne.replayed, false);
  assert.equal(manualSessionTwo.replayed, false);

  const unscheduleKey = randomUUID();
  const unscheduleInput = {
    candidateId, planId, planItemId: firstItemId, idempotencyKey: unscheduleKey,
    operationFingerprintPayload: { operation: "unscheduled", itemId: firstItemId },
    data: {
      version: 1 as const, operation: "unscheduled" as const, itemId: firstItemId,
      previousScheduled: true as const, scheduled: false as const, previousOrder: 3, newOrder: null,
    },
  };
  const unscheduled = await recordDailyPlanManualChange(unscheduleInput);
  assert.equal(unscheduled.replayed, false);
  assert.equal(unscheduled.event.eventType, "manual_change");
  const unscheduleReplay = await recordDailyPlanManualChange({
    ...unscheduleInput,
    data: { ...unscheduleInput.data, previousOrder: 1 },
  });
  assert.equal(unscheduleReplay.replayed, true);
  assert.equal(unscheduleReplay.event.id, unscheduled.event.id);
  await assert.rejects(recordDailyPlanManualChange({
    ...unscheduleInput,
    operationFingerprintPayload: { operation: "unscheduled", itemId: secondItemId },
  }), { message: "DAILY_PLAN_MANUAL_CHANGE_IDEMPOTENCY_CONFLICT" });
  await assert.rejects(recordDailyPlanManualChange({
    ...unscheduleInput,
    idempotencyKey: randomUUID(),
  }), { message: "DAILY_PLAN_MANUAL_CHANGE_STALE" });

  const invalidTopicItemId = randomUUID();
  await assert.rejects(recordDailyPlanManualChange({
    candidateId, planId, planItemId: invalidTopicItemId, idempotencyKey: randomUUID(),
    data: {
      version: 1, operation: "activity_added", itemId: invalidTopicItemId,
      topicId: foreignTopicId, topicName: "Foreign topic", subjectName: "Other synthetic subject",
      activityType: "study", previousScheduled: false, scheduled: true,
      previousOrder: null, newOrder: 6, previousDurationMinutes: null, newDurationMinutes: 20,
    },
  }), { message: "DAILY_PLAN_MANUAL_CHANGE_TOPIC_INVALID" });
  await assert.rejects(recordDailyPlanManualChange({
    candidateId, planId: otherPlanId, planItemId: randomUUID(), idempotencyKey: randomUUID(),
    data: {
      version: 1, operation: "activity_added", itemId: randomUUID(),
      topicId: topicId, topicName: "Snapshot topic", subjectName: "Synthetic subject",
      activityType: "study", previousScheduled: false, scheduled: true,
      previousOrder: null, newOrder: 2, previousDurationMinutes: null, newDurationMinutes: 20,
    },
  }), { message: "STUDY_PLAN_NOT_FOUND" });

  const terminalItemId = randomUUID();
  await db.insert(dailyStudyPlanItems).values(initialDuration(terminalItemId, 10));
  await db.insert(dailyPlanItemEvents).values({
    candidateId, planId, planItemId: terminalItemId, eventType: "ignored", data: null,
  });
  await assert.rejects(recordDailyPlanManualChange({
    candidateId, planId, planItemId: firstItemId, idempotencyKey: randomUUID(),
    data: {
      version: 1, operation: "reorder", changes: [
        { itemId: firstItemId, previousOrder: 2, newOrder: 1 },
        { itemId: secondItemId, previousOrder: 1, newOrder: 2 },
        { itemId: terminalItemId, previousOrder: 10, newOrder: 10 },
      ],
    },
  }), { message: "DAILY_PLAN_MANUAL_CHANGE_REORDER_SET_MISMATCH" });
  await assert.rejects(recordDailyPlanManualChange({
    candidateId, planId, planItemId: terminalItemId, idempotencyKey: randomUUID(),
    data: {
      version: 1, operation: "duration_changed", itemId: terminalItemId,
      previousDurationMinutes: 20, newDurationMinutes: 25,
    },
  }), { message: "DAILY_PLAN_MANUAL_CHANGE_TERMINAL_CONFLICT" });
  await assert.rejects(recordDailyPlanManualChange({
    candidateId, planId, planItemId: terminalItemId, idempotencyKey: randomUUID(),
    data: {
      version: 1, operation: "unscheduled", itemId: terminalItemId,
      previousScheduled: true, scheduled: false, previousOrder: 10, newOrder: null,
    },
  }), { message: "DAILY_PLAN_MANUAL_CHANGE_TERMINAL_CONFLICT" });

  const raceTerminalItemId = randomUUID();
  await db.insert(dailyStudyPlanItems).values(initialDuration(raceTerminalItemId, 11));
  const terminalRace = await Promise.allSettled([
    recordDailyPlanManualChange({
      candidateId, planId, planItemId: raceTerminalItemId, idempotencyKey: randomUUID(),
      data: { version: 1, operation: "duration_changed", itemId: raceTerminalItemId, previousDurationMinutes: 20, newDurationMinutes: 22 },
    }),
    recordDailyPlanItemDecision({
      candidateId, planId, planItemId: raceTerminalItemId, eventType: "completed", idempotencyKey: randomUUID(),
    }),
  ]);
  assert.equal(terminalRace[1].status, "fulfilled");
  if (terminalRace[0].status === "rejected") {
    assert.equal((terminalRace[0].reason as Error).message, "DAILY_PLAN_MANUAL_CHANGE_TERMINAL_CONFLICT");
  } else if (terminalRace[1].status === "fulfilled") {
    assert.ok(terminalRace[0].value.event.occurredAt < terminalRace[1].value.event.occurredAt);
  }

  const unscheduleRaceItemId = randomUUID();
  await db.insert(dailyStudyPlanItems).values(initialDuration(unscheduleRaceItemId, 13));
  const unscheduleTerminalRace = await Promise.allSettled([
    recordDailyPlanManualChange({
      candidateId, planId, planItemId: unscheduleRaceItemId, idempotencyKey: randomUUID(),
      data: {
        version: 1, operation: "unscheduled", itemId: unscheduleRaceItemId,
        previousScheduled: true, scheduled: false, previousOrder: 13, newOrder: null,
      },
    }),
    recordDailyPlanItemDecision({
      candidateId, planId, planItemId: unscheduleRaceItemId, eventType: "ignored", idempotencyKey: randomUUID(),
    }),
  ]);
  assert.equal(unscheduleTerminalRace[1].status, "fulfilled");
  if (unscheduleTerminalRace[0].status === "rejected") {
    assert.equal((unscheduleTerminalRace[0].reason as Error).message, "DAILY_PLAN_MANUAL_CHANGE_TERMINAL_CONFLICT");
  } else {
    assert.ok(unscheduleTerminalRace[0].value.event.occurredAt < unscheduleTerminalRace[1].value.event.occurredAt);
  }

  const projection = await getDailyStudyPlanDetails(candidateId, planId);
  assert.ok(projection);
  const first = projection.items.find((item) => item.id === firstItemId)!;
  assert.equal(first.presentationOrder, 1);
  assert.equal(first.recommendedDurationMinutes, 30);
  assert.equal(first.explanation, "Immutable explanation 1");
  assert.equal(first.personalization?.plannedDurationMinutes, 46);
  assert.equal(first.personalization?.isScheduled, false);
  assert.equal(first.personalization?.presentationOrder, null);
  assert.ok(first.execution?.events.some((event) => event.id === unscheduled.event.id));
  assert.equal(first.execution?.executedMinutes, 17);
  assert.equal(first.execution?.sessionCount, 1);
  assert.equal(first.execution?.status, "in_progress");
  const addedItem = projection.items.find((item) => item.id === manualItemId)!;
  assert.equal(addedItem.recommendationSource, "manual");
  assert.equal(addedItem.personalization?.isManual, true);
  assert.equal(addedItem.personalization?.isScheduled, true);
  assert.equal(addedItem.recommendedDurationMinutes, 25);
  assert.equal(addedItem.execution?.executedMinutes, 19);
  assert.equal(addedItem.execution?.sessionCount, 2);
  assert.equal(addedItem.execution?.status, "in_progress");
  assert.equal(addedItem.execution?.lastSessionAt?.toISOString(), "2026-11-13T13:00:00.000Z");
  assert.ok(first.execution?.events.some((event) => event.id === positioned.event.id));
  const planOrder = projection.items
    .filter((item) => item.personalization?.isScheduled)
    .sort((left, right) => left.personalization!.presentationOrder! - right.personalization!.presentationOrder!)
    .map((item) => item.id);
  assert.deepEqual(planOrder.slice(0, 3), [secondItemId, positionedItemId, manualItemId]);
  const manualHistory = await getStudySessionHistory(candidateId, { page: 1, limit: 100 });
  assert.equal(manualHistory.sessions.filter((session) => session.studyPlanItemId === manualItemId).length, 2);
  assert.equal(projection.items.find((item) => item.id === raceTerminalItemId)?.execution?.status, "completed");
  const unchangedSession = await db.select({
    id: studySessions.id,
    studyPlanItemId: studySessions.studyPlanItemId,
    durationMinutes: studySessions.durationMinutes,
    studiedAt: studySessions.studiedAt,
  }).from(studySessions).where(eq(studySessions.id, priorSessionId));
  assert.equal(unchangedSession.length, 1);
  assert.deepEqual(unchangedSession[0], {
    id: priorSessionId,
    studyPlanItemId: firstItemId,
    durationMinutes: 17,
    studiedAt: new Date("2026-11-13T10:00:00.000Z"),
  });
  assert.equal(first.execution?.executedMinutes, 17);
});
