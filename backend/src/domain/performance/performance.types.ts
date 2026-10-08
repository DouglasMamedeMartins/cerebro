export type ReliabilityLevel =
  | "very_low"
  | "low"
  | "moderate"
  | "high"
  | "very_high";

export type MasteryStatus = "learning" | "weak" | "developing" | "consolidated";

export interface TopicPerformance {
  topicId: string;

  attempts: number;
  correctAnswers: number;
  incorrectAnswers: number;

  accuracy: number;
  recentAccuracy: number;

  averageResponseTimeSeconds: number | null;
  averageConfidence: number | null;

  reliability: ReliabilityLevel;
  mastery: number;
  masteryStatus: MasteryStatus;
}
