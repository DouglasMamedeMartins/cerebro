import { getTopicState } from "./topic-state.service.js";

import type {
  BestAction,
  ActionReason,
  ActionType,
} from "../domain/action/best-action.schema.js";

export async function getBestAction(
  candidateId: string,
  topicId: string,
  asOf = new Date(),
): Promise<BestAction> {
  const state = await getTopicState(candidateId, topicId, asOf);

  const reasons: ActionReason[] = [];

  if (state.mastery <= 60) {
    reasons.push("weak_mastery");
  }

  if (state.trend === "decline" || state.trend === "strong_decline") {
    reasons.push("declining_trend");
  }

  if (state.reviewFactor >= 75) {
    reasons.push("review_due");
  }

  if (state.reliability === "very_low" || state.reliability === "low") {
    reasons.push("low_reliability");
  }

  if (state.coverageFactor >= 75) {
    reasons.push("low_coverage");
  }

  if (state.priorityLevel === "maximum" || state.priorityLevel === "high") {
    reasons.push("high_priority");
  }

  let type: ActionType = "questions";
  let durationMinutes = 30;

  if (state.mastery <= 60) {
    type = "study";
    durationMinutes = 30;
  } else if (state.reviewFactor >= 75) {
    type = "review";
    durationMinutes = 20;
  } else if (state.trend === "decline" || state.trend === "strong_decline") {
    type = "questions";
    durationMinutes = 30;
  }

  return {
    topicId: state.topicId,
    candidateId: state.candidateId,

    type,
    durationMinutes,

    priorityScore: state.priorityScore,
    priorityLevel: state.priorityLevel,

    mastery: state.mastery,
    masteryStatus: state.masteryStatus,

    reliability: state.reliability,
    trend: state.trend,

    reason: reasons,

    explanation: buildExplanation(type, reasons, state.mastery, state.trend),

    expectedImpact: buildExpectedImpact(type),
  };
}

function buildExplanation(
  type: ActionType,
  reasons: ActionReason[],
  mastery: number,
  trend: string,
): string {
  const reasonText = reasons.join(", ");

  return `Ação ${type} recomendada porque o tópico apresenta domínio de ${mastery}%, tendência ${trend} e fatores de prioridade: ${reasonText}.`;
}

function buildExpectedImpact(type: ActionType): string {
  switch (type) {
    case "study":
      return "Aumentar domínio conceitual e reduzir lacunas.";

    case "review":
      return "Recuperar o conteúdo e fortalecer a retenção.";

    case "questions":
      return "Aumentar evidência de domínio e detectar erros.";

    case "mixed":
      return "Combinar recuperação de conteúdo e validação por questões.";
    case "maintenance":
      return "Preservar o domínio consolidado e evitar perda de desempenho.";
  }
}
