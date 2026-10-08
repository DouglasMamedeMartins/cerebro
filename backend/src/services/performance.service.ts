import { desc, eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { questionAttempts, questions } from "../db/schema.js";
import type {
  MasteryStatus,
  PerformanceTrend,
  ReliabilityLevel,
  TopicPerformance,
} from "../domain/performance/performance.types.js";

function getReliabilityLevel(attempts: number): ReliabilityLevel {
  if (attempts < 10) return "very_low";
  if (attempts < 20) return "low";
  if (attempts < 40) return "moderate";
  if (attempts < 80) return "high";

  return "very_high";
}

function getMasteryStatus(mastery: number): MasteryStatus {
  if (mastery <= 50) return "learning";
  if (mastery <= 60) return "weak";
  if (mastery <= 91) return "developing";

  return "consolidated";
}

function getPerformanceTrend(
  recentAccuracy: number,
  previousAccuracy: number | null,
): PerformanceTrend {
  if (previousAccuracy === null) {
    return "stable";
  }

  const difference = recentAccuracy - previousAccuracy;

  if (difference >= 15) {
    return "strong_improvement";
  }

  if (difference >= 5) {
    return "improvement";
  }

  if (difference <= -15) {
    return "strong_decline";
  }

  if (difference <= -5) {
    return "decline";
  }

  return "stable";
}

function getDifficultyFactor(difficulty: number | null): number {
  if (difficulty === null) {
    return 1;
  }

  return 0.8 + difficulty * 0.1;
}

function calculateMastery(
  attempts: Array<{
    isCorrect: boolean;
    difficulty: number | null;
  }>,
): number {
  if (attempts.length === 0) {
    return 0;
  }

  let totalWeight = 0;
  let achievedWeight = 0;

  for (const attempt of attempts) {
    const factor = getDifficultyFactor(attempt.difficulty);

    totalWeight += factor;

    if (attempt.isCorrect) {
      achievedWeight += factor;
    }
  }

  const mastery = totalWeight > 0 ? (achievedWeight / totalWeight) * 100 : 0;

  return Math.round(mastery * 100) / 100;
}

export async function getTopicPerformance(
  topicId: string,
  candidateId: string,
): Promise<TopicPerformance> {
  const attempts = await db
    .select({
      id: questionAttempts.id,
      isCorrect: questionAttempts.isCorrect,
      responseTimeSeconds: questionAttempts.responseTimeSeconds,
      confidence: questionAttempts.confidence,
      answeredAt: questionAttempts.answeredAt,
      difficulty: questions.difficulty,
    })
    .from(questionAttempts)
    .innerJoin(questions, eq(questionAttempts.questionId, questions.id))
    .where(
      and(
        eq(questions.topicId, topicId),
        eq(questionAttempts.candidateId, candidateId),
      ),
    )
    .orderBy(desc(questionAttempts.answeredAt));

  const totalAttempts = attempts.length;

  const correctAnswers = attempts.filter((attempt) => attempt.isCorrect).length;

  const incorrectAnswers = totalAttempts - correctAnswers;

  const accuracy =
    totalAttempts > 0 ? (correctAnswers / totalAttempts) * 100 : 0;

  const recentAttempts = attempts.slice(0, 10);
  const previousAttempts = attempts.slice(10, 20);

  const recentCorrectAnswers = recentAttempts.filter(
    (attempt) => attempt.isCorrect,
  ).length;

  const recentAccuracy =
    recentAttempts.length > 0
      ? (recentCorrectAnswers / recentAttempts.length) * 100
      : 0;

  const previousCorrectAnswers = previousAttempts.filter(
    (attempt) => attempt.isCorrect,
  ).length;

  const previousAccuracy =
    previousAttempts.length > 0
      ? (previousCorrectAnswers / previousAttempts.length) * 100
      : null;

  const responseTimes = attempts
    .map((attempt) => attempt.responseTimeSeconds)
    .filter((value): value is number => value !== null);

  const averageResponseTimeSeconds =
    responseTimes.length > 0
      ? responseTimes.reduce((sum, value) => sum + value, 0) /
        responseTimes.length
      : null;

  const confidenceValues = attempts
    .map((attempt) => attempt.confidence)
    .filter((value): value is number => value !== null);

  const averageConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) /
        confidenceValues.length
      : null;

  const mastery = calculateMastery(attempts);

  return {
    topicId,
    attempts: totalAttempts,
    correctAnswers,
    incorrectAnswers,
    accuracy: Math.round(accuracy * 100) / 100,
    recentAccuracy: Math.round(recentAccuracy * 100) / 100,
    averageResponseTimeSeconds:
      averageResponseTimeSeconds !== null
        ? Math.round(averageResponseTimeSeconds * 100) / 100
        : null,
    averageConfidence:
      averageConfidence !== null
        ? Math.round(averageConfidence * 100) / 100
        : null,
    reliability: getReliabilityLevel(totalAttempts),
    mastery,
    masteryStatus: getMasteryStatus(mastery),
    trend: getPerformanceTrend(recentAccuracy, previousAccuracy),
  };
}
