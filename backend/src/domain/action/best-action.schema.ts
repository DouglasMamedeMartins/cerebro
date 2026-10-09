import {
  MasteryStatus,
  PerformanceTrend,
  ReliabilityLevel,
} from "../performance/performance.types.js";
import { PriorityLevel } from "../priority/priority.schema,.js";

export type ActionType =
  | "study"
  | "review"
  | "questions"
  | "mixed"
  | "maintenance";

export type ActionReason =
  | "weak_mastery"
  | "declining_trend"
  | "review_due"
  | "low_reliability"
  | "low_coverage"
  | "high_priority"
  | "insufficient_data";

export interface BestAction {
  topicId: string;
  candidateId: string;

  type: ActionType;

  durationMinutes: number;

  priorityScore: number;
  priorityLevel: PriorityLevel;

  mastery: number;
  masteryStatus: MasteryStatus;

  reliability: ReliabilityLevel;
  trend: PerformanceTrend;

  reason: ActionReason[];

  explanation: string;

  expectedImpact: string;
}
