import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

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

export const studySessions = pgTable("study_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),

  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id),

  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),

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
});
