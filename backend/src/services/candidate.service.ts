import { db } from "../db/index.js";
import { candidates } from "../db/schema.js";
import type { CreateCandidateInput } from "../domain/candidate/candidate.schema.js";

export async function createCandidate(data: CreateCandidateInput) {
  const [candidate] = await db
    .insert(candidates)
    .values({
      name: data.name,
      email: data.email,
      editalVersionId: data.editalVersionId,
    })
    .returning();

  return candidate;
}
