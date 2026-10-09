import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { topicReviews } from "../db/schema.js";
import { MasteryStatus } from "../domain/performance/performance.types.js";

export interface ReviewSchedule {
  intervals: number[];
  nextReviewDays: number;
}

export type ReviewStatus = "not_due" | "due_soon" | "overdue";

export interface ReviewPriority {
  status: ReviewStatus;
  factor: number;
  daysSinceReview: number | null;
  expectedIntervalDays: number;
}

const REVIEW_INTERVALS: Record<MasteryStatus, number[]> = {
  learning: [2, 7, 14, 30],
  weak: [2, 7, 14, 30],
  developing: [3, 10, 21, 45],
  consolidated: [7, 30, 60, 90],
};

export function getReviewSchedule(
  masteryStatus: MasteryStatus,
): ReviewSchedule {
  const intervals = REVIEW_INTERVALS[masteryStatus];

  return {
    intervals,
    nextReviewDays: intervals[0],
  };
}

export function calculateReviewPriority(
  masteryStatus: MasteryStatus,
  lastReviewedAt: Date | null,
  now = new Date(),
): ReviewPriority {
  const schedule = getReviewSchedule(masteryStatus);

  if (!lastReviewedAt) {
    return {
      status: "overdue",
      factor: 100,
      daysSinceReview: null,
      expectedIntervalDays: schedule.nextReviewDays,
    };
  }

  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  const daysSinceReview = Math.floor(
    (now.getTime() - lastReviewedAt.getTime()) / millisecondsPerDay,
  );

  const expectedIntervalDays = schedule.nextReviewDays;

  if (daysSinceReview >= expectedIntervalDays) {
    return {
      status: "overdue",
      factor: 100,
      daysSinceReview,
      expectedIntervalDays,
    };
  }

  const remainingDays = expectedIntervalDays - daysSinceReview;

  if (remainingDays <= 1) {
    return {
      status: "due_soon",
      factor: 75,
      daysSinceReview,
      expectedIntervalDays,
    };
  }

  const factor = (daysSinceReview / expectedIntervalDays) * 75;

  return {
    status: "not_due",
    factor: Math.round(Math.max(0, Math.min(75, factor))),
    daysSinceReview,
    expectedIntervalDays,
  };
}

export async function createTopicReview(input: {
  candidateId: string;
  topicId: string;
  masteryStatus: MasteryStatus;
  reviewedAt?: Date;
}) {
  const [review] = await db
    .insert(topicReviews)
    .values({
      candidateId: input.candidateId,
      topicId: input.topicId,
      masteryStatus: input.masteryStatus,
      reviewedAt: input.reviewedAt ?? new Date(),
    })
    .returning();

  return review;
}

export async function getLatestTopicReview(
  candidateId: string,
  topicId: string,
) {
  const [review] = await db
    .select()
    .from(topicReviews)
    .where(
      and(
        eq(topicReviews.candidateId, candidateId),
        eq(topicReviews.topicId, topicId),
      ),
    )
    .orderBy(desc(topicReviews.reviewedAt))
    .limit(1);

  return review ?? null;
}
