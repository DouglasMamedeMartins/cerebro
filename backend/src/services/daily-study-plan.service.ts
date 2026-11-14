import type {
  CandidateBestAction,
  CandidateBestActionTopic,
} from "./best-action-candidate.service.js";
import type { ActionType } from "../domain/action/best-action.schema.js";
import type { dailyStudyPlanItems, dailyStudyPlans } from "../db/schema.js";
import type { DailyPlanPersonalization } from "./daily-plan-manual-change.js";

export type DailyStudyPlanSnapshotItemInput = {
  planId: string;
  candidateId: string;
  presentationOrder: number;
  rankingPosition: number | null;
  topicId: string;
  topicName: string;
  subjectName: string;
  activityType: ActionType;
  recommendedDurationMinutes: number;
  priorityLevel: string;
  priorityScore: number;
  reason: string[];
  explanation: string;
  expectedImpact: string;
  recommendationSource: "best_action" | "additional_topic" | "manual";
};

export type DailyStudyPlanInsert = {
  candidateId: string;
  planDate: string;
  timeZone: "America/Sao_Paulo";
  availableMinutes: number;
  generatedAt: Date;
  version: number;
  idempotencyKey: string;
};

export type DailyStudyPlanRow = typeof dailyStudyPlans.$inferSelect;
export type DailyStudyPlanItemRow = typeof dailyStudyPlanItems.$inferSelect;

export type DailyPlanItemExecutionEvent = {
  id: string;
  eventType: string;
  occurredAt: Date;
  data: Record<string, unknown> | null;
};

export type DailyPlanItemExecution = {
  executedMinutes: number;
  sessionCount: number;
  recommendedTimePercent: number;
  status: "not_started" | "in_progress" | "completed" | "ignored" | "replaced";
  lastSessionAt: Date | null;
  events: DailyPlanItemExecutionEvent[];
};

export type DailyStudyPlanItemWithExecution = DailyStudyPlanItemRow & {
  execution?: DailyPlanItemExecution;
  personalization?: DailyPlanPersonalization;
};

export type DailyStudyPlanTransaction = {
  lockIdempotency(candidateId: string, key: string): Promise<void>;
  lockCandidateDate(candidateId: string, planDate: string): Promise<void>;
  findByIdempotency(candidateId: string, key: string): Promise<{
    plan: DailyStudyPlanRow;
    items: DailyStudyPlanItemRow[];
  } | undefined>;
  getNextVersion(candidateId: string, planDate: string): Promise<number>;
  insertPlan(plan: DailyStudyPlanInsert): Promise<DailyStudyPlanRow>;
  insertItems(items: DailyStudyPlanSnapshotItemInput[]): Promise<DailyStudyPlanItemRow[]>;
};

export type DailyStudyPlanStore = {
  transaction<T>(operation: (transaction: DailyStudyPlanTransaction) => Promise<T>): Promise<T>;
};

export type GenerateDailyStudyPlanResult = {
  plan: DailyStudyPlanRow;
  items: DailyStudyPlanItemRow[];
  replayed: boolean;
};

export type DailyStudyPlanWithItems = {
  plan: DailyStudyPlanRow;
  items: DailyStudyPlanItemWithExecution[];
};

export type DailyStudyPlanListFilters = {
  from?: string;
  to?: string;
  page: number;
  limit: number;
};

export type DailyStudyPlanListResult = {
  plans: Array<{
    id: string;
    planDate: string;
    availableMinutes: number;
    version: number;
    generatedAt: Date;
    itemCount: number;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type DailyStudyPlanEngine = {
  getBestAction(candidateId: string, asOf: Date): Promise<CandidateBestAction | null>;
  getRankedTopics(candidateId: string, asOf: Date): Promise<CandidateBestActionTopic[]>;
  getTopicAction(topic: CandidateBestActionTopic): CandidateBestAction;
};

export function localStudyDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new Error("LOCAL_DATE_UNAVAILABLE");
  return `${year}-${month}-${day}`;
}

export function createDailyStudyPlanGenerator(
  store: DailyStudyPlanStore,
  engine: DailyStudyPlanEngine,
  now: () => Date = () => new Date(),
) {
  return async function generateDailyStudyPlan(input: {
    candidateId: string;
    availableMinutes: number;
    idempotencyKey: string;
  }): Promise<GenerateDailyStudyPlanResult> {
    const generatedAt = now();
    const planDate = localStudyDate(generatedAt);

    return store.transaction(async (transaction) => {
      await transaction.lockIdempotency(input.candidateId, input.idempotencyKey);

      const existing = await transaction.findByIdempotency(
        input.candidateId,
        input.idempotencyKey,
      );
      if (existing) {
        if (existing.plan.availableMinutes !== input.availableMinutes) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        return { ...existing, replayed: true };
      }

      const bestAction = await engine.getBestAction(input.candidateId, generatedAt);
      if (!bestAction) throw new Error("NO_ACTION_AVAILABLE");
      const rankedTopics = await engine.getRankedTopics(input.candidateId, generatedAt);

      const bestRankingPosition = rankedTopics.findIndex(
        (topic) => topic.topicId === bestAction.topicId,
      );
      const recommended: Array<{
        action: CandidateBestAction;
        rankingPosition: number | null;
        source: "best_action" | "additional_topic";
      }> = [{
        action: bestAction,
        rankingPosition: bestRankingPosition >= 0 ? bestRankingPosition + 1 : null,
        source: "best_action" as const,
      }];

      if (bestAction.durationMinutes <= input.availableMinutes) {
        let remainingMinutes = input.availableMinutes - bestAction.durationMinutes;
        const additionalTopics = rankedTopics
          .map((topic, index) => ({ topic, rankingPosition: index + 1 }))
          .filter(({ topic }) => topic.topicId !== bestAction.topicId)
          .slice(0, 5);

        for (const { topic, rankingPosition } of additionalTopics) {
          const action = engine.getTopicAction(topic);
          if (action.durationMinutes <= remainingMinutes) {
            recommended.push({ action, rankingPosition, source: "additional_topic" });
            remainingMinutes -= action.durationMinutes;
          }
        }
      }

      await transaction.lockCandidateDate(input.candidateId, planDate);
      const version = await transaction.getNextVersion(input.candidateId, planDate);
      const plan = await transaction.insertPlan({
        candidateId: input.candidateId,
        planDate,
        timeZone: "America/Sao_Paulo",
        availableMinutes: input.availableMinutes,
        generatedAt,
        version,
        idempotencyKey: input.idempotencyKey,
      });

      const itemInputs: DailyStudyPlanSnapshotItemInput[] = recommended.map(
        ({ action, rankingPosition, source }, index) => ({
          planId: plan.id,
          candidateId: input.candidateId,
          presentationOrder: index + 1,
          rankingPosition,
          topicId: action.topicId,
          topicName: action.topicName,
          subjectName: action.subjectName,
          activityType: action.type,
          recommendedDurationMinutes: action.durationMinutes,
          priorityLevel: action.priorityLevel,
          priorityScore: action.priorityScore,
          reason: action.reason,
          explanation: action.explanation,
          expectedImpact: action.expectedImpact,
          recommendationSource: source,
        }),
      );

      const items = await transaction.insertItems(itemInputs);
      items.sort((left, right) => left.presentationOrder - right.presentationOrder);
      return { plan, items, replayed: false };
    });
  };
}
