import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { questions } from "../db/schema.js";
import type {
  CreateQuestionInput,
  UpdateQuestionInput,
} from "../domain/question/question.schema.js";

export async function createQuestion(data: CreateQuestionInput) {
  const [question] = await db
    .insert(questions)
    .values({
      topicId: data.topicId,
      statement: data.statement,
      options: data.options,
      correctOption: data.correctOption,
      explanation: data.explanation,
      difficulty: data.difficulty,
      source: data.source,
      year: data.year,
      isActive: data.isActive,
    })
    .returning();
  return question;
}
export async function updateQuestion(
  questionId: string,
  data: UpdateQuestionInput,
) {
  const [question] = await db
    .update(questions)
    .set(data)
    .where(eq(questions.id, questionId))
    .returning();

  if (!question) {
    throw new Error("QUESTION_NOT_FOUND");
  }

  return question;
}

export async function listQuestions(topicId?: string) {
  const result = await db
    .select({
      id: questions.id,
      topicId: questions.topicId,
      statement: questions.statement,
      options: questions.options,
      explanation: questions.explanation,
      difficulty: questions.difficulty,
      source: questions.source,
      year: questions.year,
      isActive: questions.isActive,
      createdAt: questions.createdAt,
    })
    .from(questions)
    .where(topicId ? eq(questions.topicId, topicId) : undefined);

  return result;
}
