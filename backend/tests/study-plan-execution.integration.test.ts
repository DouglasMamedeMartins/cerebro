import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
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
