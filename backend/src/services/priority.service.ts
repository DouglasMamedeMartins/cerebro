import {
  PerformancePriorityContext,
  PriorityLevel,
  TopicPriority,
  TopicPriorityInput,
  WeightPriorityContext,
} from "../domain/priority/priority.schema,.js";
import { and, eq, max, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { editalVersions, questions, subjects, topics } from "../db/schema.js";
import { getTopicPerformance } from "./performance.service.js";
import {
  calculateReviewPriority,
  getLatestTopicReview,
} from "./review.service.js";
import { getTopicCoverage } from "./coverage.service.js";

function getPriorityLevel(score: number): PriorityLevel {
  if (score >= 75) return "maximum";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";

  return "low";
}

function getTrendScore(trend: PerformancePriorityContext["trend"]): number {
  switch (trend) {
    case "strong_decline":
      return 100;

    case "decline":
      return 75;

    case "stable":
      return 50;

    case "improvement":
      return 25;

    case "strong_improvement":
      return 0;
  }
}

export function calculateTopicPriority(
  factors: TopicPriorityInput,
): TopicPriority {
  const score =
    0.25 * factors.deficit +
    0.2 * factors.weight +
    0.15 * factors.incidence +
    0.1 * factors.coverage +
    0.1 * factors.review +
    0.08 * factors.trend +
    0.07 * factors.errors +
    0.05 * factors.urgency;

  const roundedScore = Math.round(score * 100) / 100;

  return {
    score: roundedScore,
    level: getPriorityLevel(roundedScore),
    factors,
  };
}

function normalizeWeight(
  weight: number | null,
  maxWeight: number | null,
): number {
  if (weight === null || maxWeight === null || maxWeight <= 0) {
    return 0;
  }

  const normalized = (weight / maxWeight) * 100;

  return Math.round(Math.max(0, Math.min(100, normalized)) * 100) / 100;
}

export function buildPriorityFromPerformance(
  performance: PerformancePriorityContext,
  weightContext?: WeightPriorityContext,
  reviewFactor = 0,
  coverageFactor = 0,
): TopicPriorityInput {
  const deficit = Math.max(0, Math.min(100, 100 - performance.mastery));

  const errors =
    performance.attempts > 0
      ? (performance.incorrectAnswers / performance.attempts) * 100
      : 0;

  return {
    deficit: Math.round(deficit * 100) / 100,
    weight: normalizeWeight(
      weightContext?.weight ?? null,
      weightContext?.maxWeight ?? null,
    ),
    incidence: 0,
    coverage: coverageFactor,
    review: reviewFactor,
    trend: getTrendScore(performance.trend),
    errors: Math.round(errors * 100) / 100,
    urgency: calculateUrgency(weightContext?.examDate ?? null),
  };
}

async function getTopicWeightContext(topicId: string) {
  const [topicData] = await db
    .select({
      topicId: topics.id,
      subjectId: subjects.id,
      subjectWeight: subjects.weight,
      editalVersionId: editalVersions.id,
      examDate: editalVersions.examDate,
    })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .innerJoin(editalVersions, eq(subjects.editalVersionId, editalVersions.id))
    .where(eq(topics.id, topicId))
    .limit(1);

  if (!topicData) {
    throw new Error("TOPIC_NOT_FOUND");
  }

  const [maxWeightResult] = await db
    .select({
      maxWeight: max(subjects.weight),
    })
    .from(subjects)
    .where(eq(subjects.editalVersionId, topicData.editalVersionId));

  return {
    weight: topicData.subjectWeight,
    maxWeight: maxWeightResult?.maxWeight ?? null,
    examDate: topicData.examDate,
  };
}

export async function getTopicWeightPriority(topicId: string) {
  return getTopicWeightContext(topicId);
}

export async function calculateTopicPriorityForCandidate(
  topicId: string,
  candidateId: string,
  asOf = new Date(),
) {
  const [performance, weightContext, incidence, latestReview, coverage] =
    await Promise.all([
      getTopicPerformance(topicId, candidateId),
      getTopicWeightContext(topicId),
      getTopicIncidence(topicId),
      getLatestTopicReview(candidateId, topicId),
      getTopicCoverage(candidateId, topicId),
    ]);

  const reviewPriority =
    coverage.totalMinutes === 0
      ? {
          status: "not_due" as const,
          factor: 0,
          daysSinceReview: null,
          expectedIntervalDays: 0,
        }
      : calculateReviewPriority(
          performance.masteryStatus,
          latestReview?.reviewedAt ?? null,
          asOf,
        );

  const factors = buildPriorityFromPerformance(
    {
      mastery: performance.mastery,
      trend: performance.trend,
      attempts: performance.attempts,
      incorrectAnswers: performance.incorrectAnswers,
    },
    {
      weight: weightContext.weight,
      maxWeight: weightContext.maxWeight,
      examDate: weightContext.examDate,
    },
    reviewPriority.factor,
    coverage.factor,
  );

  factors.incidence = incidence;

  return calculateTopicPriority(factors);
}

async function getTopicIncidence(topicId: string): Promise<number> {
  const [topicData] = await db
    .select({
      topicId: topics.id,
      editalVersionId: editalVersions.id,
    })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .innerJoin(editalVersions, eq(subjects.editalVersionId, editalVersions.id))
    .where(eq(topics.id, topicId))
    .limit(1);

  if (!topicData) {
    throw new Error("TOPIC_NOT_FOUND");
  }

  const counts = await db
    .select({
      topicId: questions.topicId,
      questionCount: sql<number>`count(*)`,
    })
    .from(questions)
    .innerJoin(topics, eq(questions.topicId, topics.id))
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(
      and(
        eq(subjects.editalVersionId, topicData.editalVersionId),
        eq(questions.isActive, true),
      ),
    )
    .groupBy(questions.topicId);

  const currentTopic = counts.find((item) => item.topicId === topicId);

  if (!currentTopic) {
    return 0;
  }

  const maxQuestionCount = Math.max(
    ...counts.map((item) => Number(item.questionCount)),
  );

  if (maxQuestionCount <= 0) {
    return 0;
  }

  const incidence =
    (Number(currentTopic.questionCount) / maxQuestionCount) * 100;

  return Math.round(incidence * 100) / 100;
}

export async function getTopicIncidencePriority(topicId: string) {
  return getTopicIncidence(topicId);
}

function calculateUrgency(examDate: Date | null, now = new Date()): number {
  if (!examDate) {
    return 0;
  }

  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  const daysUntilExam = Math.ceil(
    (examDate.getTime() - now.getTime()) / millisecondsPerDay,
  );

  if (daysUntilExam <= 0) {
    return 100;
  }

  if (daysUntilExam >= 180) {
    return 0;
  }

  const urgency = ((180 - daysUntilExam) / 180) * 100;

  return Math.round(Math.max(0, Math.min(100, urgency)) * 100) / 100;
}
