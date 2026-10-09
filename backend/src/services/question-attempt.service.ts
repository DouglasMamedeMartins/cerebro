import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { candidates, questions, questionAttempts } from "../db/schema.js";

import type { CreateQuestionAttemptInput } from "../domain/question-attempt/question-attempt.schema.js";

export async function createQuestionAttempt(data: CreateQuestionAttemptInput) {
  const [candidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.id, data.candidateId))
    .limit(1);

  if (!candidate) {
    throw new Error("CANDIDATE_NOT_FOUND");
  }

  const [question] = await db
    .select({
      id: questions.id,
      correctOption: questions.correctOption,
      explanation: questions.explanation,
    })
    .from(questions)
    .where(eq(questions.id, data.questionId))
    .limit(1);

  if (!question) {
    throw new Error("QUESTION_NOT_FOUND");
  }

  if (!question.correctOption) {
    throw new Error("QUESTION_ANSWER_KEY_MISSING");
  }

  const isCorrect = data.selectedOption === question.correctOption;

  const [attempt] = await db
    .insert(questionAttempts)
    .values({
      candidateId: data.candidateId,
      questionId: data.questionId,
      isCorrect,
      responseTimeSeconds: data.responseTimeSeconds,
      confidence: data.confidence,
      answeredAt: data.answeredAt ? new Date(data.answeredAt) : new Date(),
    })
    .returning();

  return {
    ...attempt,
    explanation: question.explanation,
  };
}
