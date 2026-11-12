import { and, eq, lte, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { studySessions } from "../db/schema.js";

export const STUDY_STREAK_TIME_ZONE = "America/Sao_Paulo";
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export type StudyStreak = {
  currentStreak: number;
  longestStreak: number;
  totalStudyDays: number;
  lastStudyDate: string | null;
  asOfDate: string;
};

export function getLocalStudyDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDY_STREAK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function dayNumber(date: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return undefined;

  return parsed.getTime() / millisecondsPerDay;
}

export function calculateStudyStreak(
  studyDates: readonly string[],
  asOfDate: string,
): StudyStreak {
  const asOfDay = dayNumber(asOfDate);
  if (asOfDay === undefined) throw new Error("INVALID_AS_OF_DATE");

  const uniqueStudyDays = [...new Set(studyDates)]
    .map((date) => ({ date, day: dayNumber(date) }))
    .filter((item): item is { date: string; day: number } => item.day !== undefined && item.day <= asOfDay)
    .sort((left, right) => left.day - right.day);

  let longestStreak = 0;
  let runningStreak = 0;
  let previousDay: number | undefined;
  const days = new Set(uniqueStudyDays.map(({ day }) => day));

  for (const { day } of uniqueStudyDays) {
    runningStreak = previousDay !== undefined && day === previousDay + 1
      ? runningStreak + 1
      : 1;
    longestStreak = Math.max(longestStreak, runningStreak);
    previousDay = day;
  }

  const last = uniqueStudyDays.at(-1);
  let currentStreak = 0;
  if (last && last.day >= asOfDay - 1) {
    currentStreak = 1;
    while (days.has(last.day - currentStreak)) currentStreak += 1;
  }

  return {
    currentStreak,
    longestStreak,
    totalStudyDays: uniqueStudyDays.length,
    lastStudyDate: last?.date ?? null,
    asOfDate,
  };
}

export async function getCandidateStudyStreak(
  candidateId: string,
  now = new Date(),
): Promise<StudyStreak> {
  const asOfDate = getLocalStudyDate(now);
  const localDate = sql`(${studySessions.studiedAt} AT TIME ZONE 'America/Sao_Paulo')::date`;
  const localStudyDate = sql<string>`to_char(${studySessions.studiedAt} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      studyDate: localStudyDate,
    })
    .from(studySessions)
    .where(and(
      eq(studySessions.candidateId, candidateId),
      lte(studySessions.studiedAt, now),
      sql`${localDate} <= ${asOfDate}::date`,
    ))
    .groupBy(localStudyDate);

  return calculateStudyStreak(rows.map(({ studyDate }) => studyDate), asOfDate);
}
