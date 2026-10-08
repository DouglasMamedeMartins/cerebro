import { db } from "../db/index.js";
import { subjects } from "../db/schema.js";
import type { CreateSubjectInput } from "../domain/subject/subject.schema.js";

export async function createSubject(data: CreateSubjectInput) {
  const [subject] = await db
    .insert(subjects)
    .values({
      editalVersionId: data.editalVersionId,
      name: data.name,
      description: data.description,
      weight: data.weight,
      position: data.position,
    })
    .returning();

  return subject;
}
