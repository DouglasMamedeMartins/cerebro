import { desc, eq, and } from "drizzle-orm";

import { db } from "../db/index.js";
import { studySessions } from "../db/schema.js";

export interface CoverageResult {
  totalMinutes: number;
  lastStudiedAt: Date | null;
  daysSinceStudy: number | null;
  factor: number;
}

export async function getTopicCoverage(
  candidateId: string,
  topicId: string,
  now = new Date(),
): Promise<CoverageResult> {
  const sessions = await db
    .select({
      durationMinutes: studySessions.durationMinutes,
      studiedAt: studySessions.studiedAt,
    })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.candidateId, candidateId),
        eq(studySessions.topicId, topicId),
      ),
    )
    .orderBy(desc(studySessions.studiedAt));

  if (sessions.length === 0) {
    return {
      totalMinutes: 0,
      lastStudiedAt: null,
      daysSinceStudy: null,
      factor: 100,
    };
  }

  const totalMinutes = sessions.reduce(
    (total, session) => total + session.durationMinutes,
    0,
  );

  const lastStudiedAt = sessions[0].studiedAt;

  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  const daysSinceStudy = Math.max(
    0,
    Math.floor((now.getTime() - lastStudiedAt.getTime()) / millisecondsPerDay),
  );

  let factor = 0;

  if (daysSinceStudy >= 30) {
    factor = 100;
  } else if (daysSinceStudy >= 14) {
    factor = 75;
  } else if (daysSinceStudy >= 7) {
    factor = 40;
  } else if (daysSinceStudy >= 3) {
    factor = 15;
  }

  return {
    totalMinutes,
    lastStudiedAt,
    daysSinceStudy,
    factor,
  };
}
