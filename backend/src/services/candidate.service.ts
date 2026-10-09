import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { candidates } from "../db/schema.js";
import type {
  CreateCandidateInput,
  UpdateCandidateInput,
} from "../domain/candidate/candidate.schema.js";

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

export async function getCandidates() {
  return await db
    .select()
    .from(candidates)
    .where(eq(candidates.isActive, true))
    .orderBy(candidates.createdAt);
}

export async function getCandidateById(candidateId: string) {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  if (!candidate || !candidate.isActive) {
    return null;
  }

  return candidate;
}

export async function updateCandidate(
  candidateId: string,
  data: UpdateCandidateInput,
) {
  const [candidate] = await db
    .update(candidates)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(candidates.id, candidateId), eq(candidates.isActive, true)))
    .returning();

  return candidate ?? null;
}

export async function deactivateCandidate(candidateId: string) {
  const [candidate] = await db
    .update(candidates)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId))
    .returning();

  return candidate ?? null;
}
