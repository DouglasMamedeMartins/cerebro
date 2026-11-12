import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  candidates,
  dailyStudyPlanItems,
  dailyStudyPlans,
  studySessions,
  subjects,
  topics,
} from "../db/schema.js";
import type { CreateStudySessionInput } from "../domain/study-session/study-session.schema.js";

export type CreateStudySessionResult = {
  session: typeof studySessions.$inferSelect;
  replayed: boolean;
};

function fingerprintOriginalRequest(data: CreateStudySessionInput): string {
  const originalRequest = [
    data.topicId,
    data.durationMinutes,
    data.studiedAt === undefined ? [false] : [true, data.studiedAt],
    data.studyPlanItemId === undefined ? [false] : [true, data.studyPlanItemId],
  ];

  return createHash("sha256").update(JSON.stringify(originalRequest)).digest("hex");
}

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
    studyPlanItemId: string | null;
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

export async function createStudySession(
  data: CreateStudySessionInput,
  idempotencyKey?: string,
): Promise<CreateStudySessionResult> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: candidates.id, isActive: candidates.isActive })
      .from(candidates)
      .where(eq(candidates.id, data.candidateId))
      .limit(1);

    if (!candidate) {
      throw new Error("CANDIDATE_NOT_FOUND");
    }

    if (!candidate.isActive) {
      throw new Error("CANDIDATE_INACTIVE");
    }

    const requestFingerprint = idempotencyKey
      ? fingerprintOriginalRequest(data)
      : null;

    if (idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(studySessions)
        .where(and(
          eq(studySessions.candidateId, data.candidateId),
          eq(studySessions.idempotencyKey, idempotencyKey),
        ))
        .limit(1);

      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new Error("STUDY_SESSION_IDEMPOTENCY_CONFLICT");
        }
        return { session: existing, replayed: true };
      }
    }

    if (data.studyPlanItemId) {
      const [planItem] = await tx
        .select({ topicId: dailyStudyPlanItems.topicId })
        .from(dailyStudyPlanItems)
        .innerJoin(
          dailyStudyPlans,
          and(
            eq(dailyStudyPlanItems.planId, dailyStudyPlans.id),
            eq(dailyStudyPlanItems.candidateId, dailyStudyPlans.candidateId),
          ),
        )
        .where(and(
          eq(dailyStudyPlanItems.id, data.studyPlanItemId),
          eq(dailyStudyPlanItems.candidateId, data.candidateId),
        ))
        .limit(1);

      if (!planItem) {
        throw new Error("STUDY_PLAN_ITEM_NOT_FOUND");
      }

      if (planItem.topicId !== data.topicId) {
        throw new Error("STUDY_PLAN_ITEM_TOPIC_MISMATCH");
      }
    }

    const values = {
      candidateId: data.candidateId,
      topicId: data.topicId,
      studyPlanItemId: data.studyPlanItemId ?? null,
      durationMinutes: data.durationMinutes,
      studiedAt: data.studiedAt ? new Date(data.studiedAt) : new Date(),
      idempotencyKey: idempotencyKey ?? null,
      requestFingerprint,
    };

    if (!idempotencyKey) {
      const [session] = await tx.insert(studySessions).values(values).returning();
      if (!session) throw new Error("STUDY_SESSION_INSERT_FAILED");
      return { session, replayed: false };
    }

    const [session] = await tx
      .insert(studySessions)
      .values(values)
      .onConflictDoNothing({
        target: [studySessions.candidateId, studySessions.idempotencyKey],
      })
      .returning();

    if (session) return { session, replayed: false };

    // The unique index arbitrates concurrent requests; read its winner in this transaction.
    const [concurrentSession] = await tx
      .select()
      .from(studySessions)
      .where(and(
        eq(studySessions.candidateId, data.candidateId),
        eq(studySessions.idempotencyKey, idempotencyKey),
      ))
      .limit(1);

    if (!concurrentSession) {
      throw new Error("STUDY_SESSION_IDEMPOTENCY_RESULT_UNAVAILABLE");
    }
    if (concurrentSession.requestFingerprint !== requestFingerprint) {
      throw new Error("STUDY_SESSION_IDEMPOTENCY_CONFLICT");
    }

    return { session: concurrentSession, replayed: true };
  });
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
      studyPlanItemId: studySessions.studyPlanItemId,
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
