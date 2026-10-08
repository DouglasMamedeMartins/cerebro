import { db } from "../db/index.js";
import { topics } from "../db/schema.js";
import type { CreateTopicInput } from "../domain/topic/topic.schema.js";

export async function createTopic(data: CreateTopicInput) {
  const [topic] = await db
    .insert(topics)
    .values({
      subjectId: data.subjectId,
      parentId: data.parentId,
      name: data.name,
      description: data.description,
      position: data.position,
    })
    .returning();

  return topic;
}
