import { db } from "../db/index.js";
import { questions } from "../db/schema.js";
import type { CreateQuestionInput } from "../domain/question/question.schema.js";

export async function createQuestion(data: CreateQuestionInput) {
  const [question] = await db
    .insert(questions)
    .values({
      topicId: data.topicId,
      statement: data.statement,
      explanation: data.explanation,
      difficulty: data.difficulty,
      source: data.source,
      year: data.year,
      isActive: data.isActive,
    })
    .returning();

  return question;
}
