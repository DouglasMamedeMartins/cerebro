import {
  MasteryStatus,
  PerformanceTrend,
  ReliabilityLevel,
} from "../performance/performance.types.js";
import {
  PriorityLevel,
  TopicPriorityInput,
} from "../priority/priority.schema,.js";

export interface TopicState {
  topicId: string;
  candidateId: string;

  mastery: number;
  masteryStatus: MasteryStatus;

  reliability: ReliabilityLevel;
  attempts: number;

  trend: PerformanceTrend;
  incorrectAnswers: number;

  coverageFactor: number;
  reviewFactor: number;

  priorityScore: number;
  priorityLevel: PriorityLevel;

  priorityFactors: TopicPriorityInput;
  evaluationStatus: "not_evaluated" | "evaluated";
}
