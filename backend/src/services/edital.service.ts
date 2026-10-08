import { db } from "../db/index.js";
import { editalVersions } from "../db/schema.js";
import type { CreateEditalInput } from "../domain/edital/edital.schema.js";

export async function createEdital(data: CreateEditalInput) {
  const [edital] = await db
    .insert(editalVersions)
    .values({
      title: data.title,
      version: data.version,
      examDate: data.examDate ? new Date(data.examDate) : null,
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
      sourceUrl: data.sourceUrl,
      isOfficial: data.isOfficial,
    })
    .returning();

  return edital;
}
