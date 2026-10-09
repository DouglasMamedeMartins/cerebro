import { getTopicPerformance } from "./performance.service.js";
import { getTopicCoverage } from "./coverage.service.js";
import {
  calculateReviewPriority,
  getLatestTopicReview,
} from "./review.service.js";
import { calculateTopicPriorityForCandidate } from "./priority.service.js";

import type { TopicState } from "../domain/topic/topic-state.schema.js";

export async function getTopicState(
  candidateId: string,
  topicId: string,
  asOf = new Date(),
): Promise<TopicState> {
  const [performance, coverage, latestReview, priority] = await Promise.all([
    getTopicPerformance(topicId, candidateId),
    getTopicCoverage(candidateId, topicId),
    getLatestTopicReview(candidateId, topicId),
    calculateTopicPriorityForCandidate(topicId, candidateId, asOf),
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

  return {
    topicId,
    candidateId,
    evaluationStatus:
      performance.attempts === 0 ? "not_evaluated" : "evaluated",
    mastery: performance.mastery,
    masteryStatus: performance.masteryStatus,
    reliability: performance.reliability,
    attempts: performance.attempts,
    trend: performance.trend,
    incorrectAnswers: performance.incorrectAnswers,
    coverageFactor: coverage.factor,
    reviewFactor: reviewPriority.factor,
    priorityScore: priority.score,
    priorityLevel: priority.level,
    priorityFactors: priority.factors,
  };
}
