import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { candidates, studySessions, subjects, topics } from "../db/schema.js";
import type { CreateStudySessionInput } from "../domain/study-session/study-session.schema.js";

export type StudySessionHistoryFilters = {
  from?: string;
  to?: string;
  page: number;
  limit: number;
};

export type StudySessionHistoryResult = {
  sessions: Array<{
    id: string;
    studiedAt: Date;
    localStudyDate: string;
    durationMinutes: number;
    topicId: string;
    topicName: string | null;
    subjectName: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

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

export async function getStudySessionHistory(
  candidateId: string,
  filters: StudySessionHistoryFilters,
): Promise<StudySessionHistoryResult> {
  const conditions = [eq(studySessions.candidateId, candidateId)];
  const localStudyDate = sql`(${studySessions.studiedAt} AT TIME ZONE 'America/Sao_Paulo')::date`;

  if (filters.from) {
    conditions.push(sql`${localStudyDate} >= ${filters.from}::date`);
  }

  if (filters.to) {
    conditions.push(sql`${localStudyDate} <= ${filters.to}::date`);
  }

  const where = and(...conditions);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(studySessions)
    .where(where);

  const sessions = await db
    .select({
      id: studySessions.id,
      studiedAt: studySessions.studiedAt,
      localStudyDate: sql<string>`to_char(${studySessions.studiedAt} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      durationMinutes: studySessions.durationMinutes,
      topicId: studySessions.topicId,
      topicName: topics.name,
      subjectName: subjects.name,
    })
    .from(studySessions)
    .leftJoin(topics, eq(studySessions.topicId, topics.id))
    .leftJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(where)
    .orderBy(desc(studySessions.studiedAt), desc(studySessions.createdAt), desc(studySessions.id))
    .limit(filters.limit)
    .offset((filters.page - 1) * filters.limit);

  return {
    sessions,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}
