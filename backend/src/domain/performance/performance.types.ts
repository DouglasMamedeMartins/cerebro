export type ReliabilityLevel =
  | "very_low"
  | "low"
  | "moderate"
  | "high"
  | "very_high";

export type MasteryStatus = "learning" | "weak" | "developing" | "consolidated";

export type PerformanceTrend =
  | "strong_improvement"
  | "improvement"
  | "stable"
  | "decline"
  | "strong_decline";

export interface TopicPerformance {
  topicId: string;

  attempts: number;
  correctAnswers: number;
  incorrectAnswers: number;

  accuracy: number;
  recentAccuracy: number;

  trend: PerformanceTrend;

  averageResponseTimeSeconds: number | null;
  averageConfidence: number | null;

  reliability: ReliabilityLevel;
  mastery: number;
  masteryStatus: MasteryStatus;
}
