import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { candidates, editalVersions, subjects, topics } from "../db/schema.js";

export interface CandidateTopic {
  topicId: string;
  topicName: string;

  subjectId: string;
  subjectName: string;

  editalVersionId: string;
  editalTitle: string;
  editalVersion: number;
}

export async function getCandidateTopics(
  candidateId: string,
): Promise<CandidateTopic[]> {
  const [candidate] = await db
    .select({
      candidateId: candidates.id,
      editalVersionId: candidates.editalVersionId,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  if (!candidate) {
    throw new Error("CANDIDATE_NOT_FOUND");
  }

  if (!candidate.editalVersionId) {
    throw new Error("CANDIDATE_WITHOUT_EDITAL");
  }

  const result = await db
    .select({
      topicId: topics.id,
      topicName: topics.name,

      subjectId: subjects.id,
      subjectName: subjects.name,

      editalVersionId: editalVersions.id,
      editalTitle: editalVersions.title,
      editalVersion: editalVersions.version,
    })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .innerJoin(editalVersions, eq(subjects.editalVersionId, editalVersions.id))
    .where(eq(editalVersions.id, candidate.editalVersionId));

  return result;
}
