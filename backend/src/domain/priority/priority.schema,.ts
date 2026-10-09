export type PriorityLevel = "maximum" | "high" | "medium" | "low";

export interface WeightPriorityContext {
  weight: number | null;
  maxWeight: number | null;
  examDate: Date | null;
}

export interface TopicPriorityInput {
  deficit: number;
  weight: number;
  incidence: number;
  coverage: number;
  review: number;
  trend: number;
  errors: number;
  urgency: number;
}

export interface TopicPriority {
  score: number;
  level: PriorityLevel;
  factors: TopicPriorityInput;
}

export interface PerformancePriorityContext {
  mastery: number;
  trend:
    | "strong_improvement"
    | "improvement"
    | "stable"
    | "decline"
    | "strong_decline";
  attempts: number;
  incorrectAnswers: number;
}
