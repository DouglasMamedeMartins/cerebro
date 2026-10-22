import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { candidates, studySessions } from "../db/schema.js";
import type { CreateStudySessionInput } from "../domain/study-session/study-session.schema.js";

export async function getStudyCandidate(candidateId: string) {
  const [candidate] = await db
    .select({
      id: candidates.id,
      isActive: candidates.isActive,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  return candidate;
}

export async function createStudySession(data: CreateStudySessionInput) {
  const candidate = await getStudyCandidate(data.candidateId);

  if (!candidate) {
    throw new Error("CANDIDATE_NOT_FOUND");
  }

  if (!candidate.isActive) {
    throw new Error("CANDIDATE_INACTIVE");
  }

  const [session] = await db
    .insert(studySessions)
    .values({
      candidateId: data.candidateId,
      topicId: data.topicId,
      durationMinutes: data.durationMinutes,
      studiedAt: data.studiedAt ? new Date(data.studiedAt) : new Date(),
    })
    .returning();

  return session;
}
