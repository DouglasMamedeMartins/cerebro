import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  integer,
  doublePrecision,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const candidates = pgTable("candidates", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: varchar("name", {
    length: 120,
  }).notNull(),

  email: varchar("email", {
    length: 255,
  })
    .notNull()
    .unique(),

  passwordHash: text("password_hash"),

  isActive: boolean("is_active").default(true).notNull(),

  editalVersionId: uuid("edital_version_id").references(
    () => editalVersions.id,
  ),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const candidateSessions = pgTable("candidate_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const editalVersions = pgTable("edital_versions", {
  id: uuid("id").defaultRandom().primaryKey(),

  title: varchar("title", {
    length: 255,
  }).notNull(),

  version: integer("version").notNull(),

  examDate: timestamp("exam_date", {
    withTimezone: true,
  }),

  publishedAt: timestamp("published_at", {
    withTimezone: true,
  }),

  sourceUrl: text("source_url"),

  isOfficial: boolean("is_official").default(false).notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const subjects = pgTable("subjects", {
  id: uuid("id").defaultRandom().primaryKey(),

  editalVersionId: uuid("edital_version_id")
    .notNull()
    .references(() => editalVersions.id),

  name: varchar("name", {
    length: 150,
  }).notNull(),

  description: text("description"),

  weight: integer("weight"),

  position: integer("position"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const topics = pgTable("topics", {
  id: uuid("id").defaultRandom().primaryKey(),

  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id),

  parentId: uuid("parent_id"),

  name: varchar("name", {
    length: 255,
  }).notNull(),

  description: text("description"),

  position: integer("position"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),

  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),

  statement: text("statement").notNull(),

  options: jsonb("options").$type<{
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
  }>(),

  correctOption: varchar("correct_option", {
    length: 1,
  }),

  explanation: text("explanation"),

  difficulty: integer("difficulty"),

  source: varchar("source", {
    length: 255,
  }),

  year: integer("year"),

  isActive: boolean("is_active").default(true).notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const questionAttempts = pgTable("question_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),

  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id),

  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id),

  isCorrect: boolean("is_correct").notNull(),

  responseTimeSeconds: integer("response_time_seconds"),

  confidence: integer("confidence"),

  answeredAt: timestamp("answered_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const topicReviews = pgTable("topic_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),

  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id),

  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),

  reviewedAt: timestamp("reviewed_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  masteryStatus: varchar("mastery_status", {
    length: 30,
  }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const dailyStudyPlans = pgTable("daily_study_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id),
  planDate: date("plan_date").notNull(),
  timeZone: varchar("time_zone", { length: 64 })
    .notNull()
    .default("America/Sao_Paulo"),
  availableMinutes: integer("available_minutes").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  version: integer("version").notNull(),
  idempotencyKey: uuid("idempotency_key").notNull(),
}, (table) => [
  uniqueIndex("daily_study_plans_candidate_date_version_unique")
    .on(table.candidateId, table.planDate, table.version),
  uniqueIndex("daily_study_plans_candidate_idempotency_unique")
    .on(table.candidateId, table.idempotencyKey),
  uniqueIndex("daily_study_plans_id_candidate_unique")
    .on(table.id, table.candidateId),
  index("daily_study_plans_candidate_date_generated_idx")
    .on(table.candidateId, table.planDate, table.generatedAt),
  check("daily_study_plans_available_minutes_nonnegative", sql`${table.availableMinutes} >= 0`),
  check("daily_study_plans_version_positive", sql`${table.version} > 0`),
  check("daily_study_plans_timezone_sao_paulo", sql`${table.timeZone} = 'America/Sao_Paulo'`),
]);

export const dailyStudyPlanItems = pgTable("daily_study_plan_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: uuid("plan_id").notNull(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id),
  presentationOrder: integer("presentation_order").notNull(),
  rankingPosition: integer("ranking_position"),
  topicId: uuid("topic_id").notNull().references(() => topics.id),
  topicName: text("topic_name").notNull(),
  subjectName: text("subject_name").notNull(),
  activityType: varchar("activity_type", { length: 30 }).notNull(),
  recommendedDurationMinutes: integer("recommended_duration_minutes").notNull(),
  priorityLevel: varchar("priority_level", { length: 20 }).notNull(),
  priorityScore: doublePrecision("priority_score").notNull(),
  reason: jsonb("reason").$type<string[]>().notNull(),
  explanation: text("explanation").notNull(),
  expectedImpact: text("expected_impact").notNull(),
  recommendationSource: varchar("recommendation_source", { length: 30 }).notNull(),
}, (table) => [
  foreignKey({
    name: "daily_study_plan_items_plan_candidate_fk",
    columns: [table.planId, table.candidateId],
    foreignColumns: [dailyStudyPlans.id, dailyStudyPlans.candidateId],
  }).onDelete("restrict"),
  uniqueIndex("daily_study_plan_items_plan_order_unique")
    .on(table.planId, table.presentationOrder),
  uniqueIndex("daily_study_plan_items_id_candidate_plan_unique")
    .on(table.id, table.candidateId, table.planId),
  uniqueIndex("daily_study_plan_items_id_candidate_topic_unique")
    .on(table.id, table.candidateId, table.topicId),
  index("daily_study_plan_items_candidate_plan_idx")
    .on(table.candidateId, table.planId),
  check("daily_study_plan_items_presentation_order_positive", sql`${table.presentationOrder} > 0`),
  check("daily_study_plan_items_ranking_position_positive", sql`${table.rankingPosition} IS NULL OR ${table.rankingPosition} > 0`),
  check("daily_study_plan_items_duration_positive", sql`${table.recommendedDurationMinutes} > 0`),
  check("daily_study_plan_items_priority_level_valid", sql`${table.priorityLevel} IN ('maximum', 'high', 'medium', 'low')`),
  check("daily_study_plan_items_priority_score_range", sql`${table.priorityScore} >= 0 AND ${table.priorityScore} <= 100`),
  check("daily_study_plan_items_activity_type_valid", sql`${table.activityType} IN ('study', 'review', 'questions', 'mixed', 'maintenance')`),
  check("daily_study_plan_items_recommendation_source_valid", sql`${table.recommendationSource} IN ('best_action', 'additional_topic', 'manual')`),
]);

export const dailyPlanItemEvents = pgTable("daily_plan_item_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id),
  planId: uuid("plan_id").notNull(),
  planItemId: uuid("plan_item_id").notNull(),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  data: jsonb("data").$type<Record<string, unknown>>(),
  idempotencyKey: uuid("idempotency_key"),
  requestFingerprint: varchar("request_fingerprint", { length: 64 }),
}, (table) => [
  foreignKey({
    name: "daily_plan_item_events_plan_candidate_fk",
    columns: [table.planId, table.candidateId],
    foreignColumns: [dailyStudyPlans.id, dailyStudyPlans.candidateId],
  }).onDelete("restrict"),
  foreignKey({
    name: "daily_plan_item_events_item_owner_plan_fk",
    columns: [table.planItemId, table.candidateId, table.planId],
    foreignColumns: [dailyStudyPlanItems.id, dailyStudyPlanItems.candidateId, dailyStudyPlanItems.planId],
  }).onDelete("restrict"),
  index("daily_plan_item_events_candidate_occurred_idx")
    .on(table.candidateId, table.occurredAt),
  index("daily_plan_item_events_item_occurred_idx")
    .on(table.planItemId, table.occurredAt),
  uniqueIndex("daily_plan_item_events_candidate_idempotency_unique")
    .on(table.candidateId, table.idempotencyKey),
  uniqueIndex("daily_plan_item_events_one_terminal_per_item_unique")
    .on(table.planItemId)
    .where(sql`${table.eventType} IN ('completed', 'ignored', 'replaced')`),
  check("daily_plan_item_events_type_valid", sql`${table.eventType} IN ('completed', 'ignored', 'replaced', 'manual_change')`),
  check(
    "daily_plan_item_events_idempotency_fields_paired",
    sql`(${table.idempotencyKey} IS NULL) = (${table.requestFingerprint} IS NULL)`,
  ),
]);

export const studySessions = pgTable("study_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),

  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id),

  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),

  studyPlanItemId: uuid("study_plan_item_id"),

  idempotencyKey: uuid("idempotency_key"),

  requestFingerprint: varchar("request_fingerprint", { length: 64 }),

  durationMinutes: integer("duration_minutes").notNull(),

  studiedAt: timestamp("studied_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
}, (table) => [
  foreignKey({
    name: "study_sessions_plan_item_candidate_topic_fk",
    columns: [table.studyPlanItemId, table.candidateId, table.topicId],
    foreignColumns: [dailyStudyPlanItems.id, dailyStudyPlanItems.candidateId, dailyStudyPlanItems.topicId],
  }).onDelete("restrict"),
  index("study_sessions_plan_item_idx").on(table.studyPlanItemId),
  uniqueIndex("study_sessions_candidate_idempotency_unique")
    .on(table.candidateId, table.idempotencyKey),
  check(
    "study_sessions_idempotency_fields_paired",
    sql`(${table.idempotencyKey} IS NULL) = (${table.requestFingerprint} IS NULL)`,
  ),
]);
