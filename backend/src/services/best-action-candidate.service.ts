import { getCandidateTopics } from "./candidate-topic.service.js";
import { getTopicState } from "./topic-state.service.js";

import type {
  ActionReason,
  ActionType,
} from "../domain/action/best-action.schema.js";

export interface CandidateBestActionTopic {
  topicId: string;
  topicName: string;
  subjectName: string;

  mastery: number;
  masteryStatus: string;

  reliability: string;
  trend: string;

  priorityScore: number;
  priorityLevel: string;

  coverageFactor: number;
  reviewFactor: number;

  attempts: number;

  evaluationStatus: "not_evaluated" | "evaluated";
}

export interface CandidateBestAction {
  topicId: string;
  topicName: string;
  subjectName: string;

  type: ActionType;
  durationMinutes: number;

  priorityScore: number;
  priorityLevel: string;

  mastery: number;
  masteryStatus: string;

  reliability: string;
  trend: string;

  reason: ActionReason[];

  explanation: string;
  expectedImpact: string;
  evaluationStatus: "not_evaluated" | "evaluated";
}

export async function getCandidateBestActionTopics(
  candidateId: string,
  asOf = new Date(),
): Promise<CandidateBestActionTopic[]> {
  const topics = await getCandidateTopics(candidateId);

  const states = await Promise.all(
    topics.map(async (topic) => {
      const state = await getTopicState(candidateId, topic.topicId, asOf);

      return {
        topicId: topic.topicId,
        topicName: topic.topicName,
        subjectName: topic.subjectName,

        mastery: state.mastery,
        masteryStatus: state.masteryStatus,

        reliability: state.reliability,
        trend: state.trend,

        priorityScore: state.priorityScore,
        priorityLevel: state.priorityLevel,

        coverageFactor: state.coverageFactor,
        reviewFactor: state.reviewFactor,

        attempts: state.attempts,
        evaluationStatus: state.evaluationStatus,
      };
    }),
  );

  return states.sort((a, b) => b.priorityScore - a.priorityScore);
}

export async function getCandidateBestAction(
  candidateId: string,
  asOf = new Date(),
): Promise<CandidateBestAction | null> {
  const topics = await getCandidateTopics(candidateId);

  if (topics.length === 0) {
    return null;
  }

  const rankedTopics = await getCandidateBestActionTopics(candidateId, asOf);

  const winner = rankedTopics[0];

  if (!winner) {
    return null;
  }

  const action = decideAction(winner);

  return {
    topicId: winner.topicId,
    topicName: winner.topicName,
    subjectName: winner.subjectName,

    type: action.type,
    durationMinutes: action.durationMinutes,

    priorityScore: winner.priorityScore,
    priorityLevel: winner.priorityLevel,

    mastery: winner.mastery,
    masteryStatus: winner.masteryStatus,

    reliability: winner.reliability,
    trend: winner.trend,

    reason: action.reason,

    explanation: buildExplanation(winner, action.type, action.reason),

    expectedImpact: buildExpectedImpact(action.type),
    evaluationStatus: winner.evaluationStatus,
  };
}

function decideAction(topic: CandidateBestActionTopic): {
  type: ActionType;
  durationMinutes: number;
  reason: ActionReason[];
} {
  const highPriority: ActionReason[] =
    topic.priorityLevel === "maximum" || topic.priorityLevel === "high"
      ? ["high_priority"]
      : [];

  // Sem tentativas, precisamos diagnosticar antes de avaliar o domínio.
  if (topic.attempts === 0) {
    return {
      type: "questions",
      durationMinutes: 10,
      reason: ["insufficient_data", ...highPriority],
    };
  }

  // Conteúdo consolidado continua recebendo manutenção.
  if (
    topic.mastery >= 92 &&
    (topic.reliability === "high" || topic.reliability === "very_high")
  ) {
    return {
      type: "maintenance",
      durationMinutes: 15,
      reason: highPriority,
    };
  }

  // Domínio comprovadamente baixo: construir a base.
  if (topic.mastery <= 50) {
    return {
      type: "study",
      durationMinutes: 30,
      reason: ["weak_mastery", ...highPriority],
    };
  }

  // Conteúdo fraco com revisão atrasada.
  if (topic.mastery <= 60 && topic.reviewFactor >= 75) {
    return {
      type: "mixed",
      durationMinutes: 30,
      reason: ["weak_mastery", "review_due", ...highPriority],
    };
  }

  // Conteúdo com revisão vencida.
  if (topic.reviewFactor >= 75) {
    return {
      type: "review",
      durationMinutes: 20,
      reason: ["review_due", ...highPriority],
    };
  }

  // Desempenho em queda: validar com questões.
  if (topic.trend === "decline" || topic.trend === "strong_decline") {
    return {
      type: "questions",
      durationMinutes: 30,
      reason: ["declining_trend", ...highPriority],
    };
  }

  // Poucas evidências: coletar mais respostas.
  if (topic.reliability === "very_low" || topic.reliability === "low") {
    return {
      type: "questions",
      durationMinutes: 30,
      reason: ["low_reliability", ...highPriority],
    };
  }

  return {
    type: "questions",
    durationMinutes: 20,
    reason: highPriority,
  };
}

function buildExplanation(
  topic: CandidateBestActionTopic,
  type: ActionType,
  reason: ActionReason[],
): string {
  if (reason.includes("insufficient_data")) {
    return (
      `O tópico "${topic.topicName}" ainda não possui tentativas registradas. ` +
      "Por isso, não é possível estimar seu domínio com confiança. " +
      "Recomendamos uma avaliação diagnóstica de 10 minutos para estabelecer " +
      "uma linha de base antes de definir o próximo passo."
    );
  }

  const reasonText = reason.join(", ");

  return (
    `O tópico "${topic.topicName}" foi selecionado como melhor ação porque ` +
    `apresenta prioridade ${topic.priorityScore}, domínio de ${topic.mastery}% ` +
    `e prioridade ${topic.priorityLevel}. ` +
    `Ação recomendada: ${type}. ` +
    `Fatores identificados: ${reasonText}.`
  );
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
