import { desc, eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { questionAttempts, questions } from "../db/schema.js";
import type {
  MasteryStatus,
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

  const recentCorrectAnswers = recentAttempts.filter(
    (attempt) => attempt.isCorrect,
  ).length;

  const recentAccuracy =
    recentAttempts.length > 0
      ? (recentCorrectAnswers / recentAttempts.length) * 100
      : 0;

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

  const mastery = Math.round(accuracy * 100) / 100;

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
  };
}
