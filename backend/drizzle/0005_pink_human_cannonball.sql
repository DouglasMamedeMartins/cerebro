CREATE TABLE "daily_plan_item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_item_id" uuid NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb,
	CONSTRAINT "daily_plan_item_events_type_valid" CHECK ("daily_plan_item_events"."event_type" IN ('ignored', 'replaced', 'manual_change'))
);
--> statement-breakpoint
CREATE TABLE "daily_study_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"presentation_order" integer NOT NULL,
	"ranking_position" integer,
	"topic_id" uuid NOT NULL,
	"topic_name" text NOT NULL,
	"subject_name" text NOT NULL,
	"activity_type" varchar(30) NOT NULL,
	"recommended_duration_minutes" integer NOT NULL,
	"priority_level" varchar(20) NOT NULL,
	"priority_score" double precision NOT NULL,
	"reason" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"expected_impact" text NOT NULL,
	"recommendation_source" varchar(30) NOT NULL,
	CONSTRAINT "daily_study_plan_items_presentation_order_positive" CHECK ("daily_study_plan_items"."presentation_order" > 0),
	CONSTRAINT "daily_study_plan_items_ranking_position_positive" CHECK ("daily_study_plan_items"."ranking_position" IS NULL OR "daily_study_plan_items"."ranking_position" > 0),
	CONSTRAINT "daily_study_plan_items_duration_positive" CHECK ("daily_study_plan_items"."recommended_duration_minutes" > 0),
	CONSTRAINT "daily_study_plan_items_priority_level_valid" CHECK ("daily_study_plan_items"."priority_level" IN ('maximum', 'high', 'medium', 'low')),
	CONSTRAINT "daily_study_plan_items_priority_score_range" CHECK ("daily_study_plan_items"."priority_score" >= 0 AND "daily_study_plan_items"."priority_score" <= 100),
	CONSTRAINT "daily_study_plan_items_activity_type_valid" CHECK ("daily_study_plan_items"."activity_type" IN ('study', 'review', 'questions', 'mixed', 'maintenance')),
	CONSTRAINT "daily_study_plan_items_recommendation_source_valid" CHECK ("daily_study_plan_items"."recommendation_source" IN ('best_action', 'additional_topic'))
);
--> statement-breakpoint
CREATE TABLE "daily_study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"plan_date" date NOT NULL,
	"time_zone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"available_minutes" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer NOT NULL,
	"idempotency_key" uuid NOT NULL,
	CONSTRAINT "daily_study_plans_available_minutes_nonnegative" CHECK ("daily_study_plans"."available_minutes" >= 0),
	CONSTRAINT "daily_study_plans_version_positive" CHECK ("daily_study_plans"."version" > 0),
	CONSTRAINT "daily_study_plans_timezone_sao_paulo" CHECK ("daily_study_plans"."time_zone" = 'America/Sao_Paulo')
);
--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "study_plan_item_id" uuid;--> statement-breakpoint
-- PostgreSQL requires a unique key on every referenced composite column set
-- before the corresponding foreign keys can be added.
CREATE UNIQUE INDEX "daily_study_plan_items_id_candidate_plan_unique" ON "daily_study_plan_items" USING btree ("id","candidate_id","plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_study_plan_items_id_candidate_topic_unique" ON "daily_study_plan_items" USING btree ("id","candidate_id","topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_study_plans_id_candidate_unique" ON "daily_study_plans" USING btree ("id","candidate_id");--> statement-breakpoint
ALTER TABLE "daily_plan_item_events" ADD CONSTRAINT "daily_plan_item_events_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plan_item_events" ADD CONSTRAINT "daily_plan_item_events_plan_candidate_fk" FOREIGN KEY ("plan_id","candidate_id") REFERENCES "public"."daily_study_plans"("id","candidate_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plan_item_events" ADD CONSTRAINT "daily_plan_item_events_item_owner_plan_fk" FOREIGN KEY ("plan_item_id","candidate_id","plan_id") REFERENCES "public"."daily_study_plan_items"("id","candidate_id","plan_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_study_plan_items" ADD CONSTRAINT "daily_study_plan_items_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_study_plan_items" ADD CONSTRAINT "daily_study_plan_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_study_plan_items" ADD CONSTRAINT "daily_study_plan_items_plan_candidate_fk" FOREIGN KEY ("plan_id","candidate_id") REFERENCES "public"."daily_study_plans"("id","candidate_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_study_plans" ADD CONSTRAINT "daily_study_plans_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_plan_item_events_candidate_occurred_idx" ON "daily_plan_item_events" USING btree ("candidate_id","occurred_at");--> statement-breakpoint
CREATE INDEX "daily_plan_item_events_item_occurred_idx" ON "daily_plan_item_events" USING btree ("plan_item_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_study_plan_items_plan_order_unique" ON "daily_study_plan_items" USING btree ("plan_id","presentation_order");--> statement-breakpoint
CREATE INDEX "daily_study_plan_items_candidate_plan_idx" ON "daily_study_plan_items" USING btree ("candidate_id","plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_study_plans_candidate_date_version_unique" ON "daily_study_plans" USING btree ("candidate_id","plan_date","version");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_study_plans_candidate_idempotency_unique" ON "daily_study_plans" USING btree ("candidate_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "daily_study_plans_candidate_date_generated_idx" ON "daily_study_plans" USING btree ("candidate_id","plan_date","generated_at");--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_plan_item_candidate_topic_fk" FOREIGN KEY ("study_plan_item_id","candidate_id","topic_id") REFERENCES "public"."daily_study_plan_items"("id","candidate_id","topic_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_sessions_plan_item_idx" ON "study_sessions" USING btree ("study_plan_item_id");
--> statement-breakpoint
CREATE FUNCTION "public"."reject_immutable_study_plan_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Study plan snapshots and item events are append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "daily_study_plans_immutable_trigger" BEFORE UPDATE OR DELETE ON "public"."daily_study_plans" FOR EACH ROW EXECUTE FUNCTION "public"."reject_immutable_study_plan_mutation"();--> statement-breakpoint
CREATE TRIGGER "daily_study_plan_items_immutable_trigger" BEFORE UPDATE OR DELETE ON "public"."daily_study_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."reject_immutable_study_plan_mutation"();--> statement-breakpoint
CREATE TRIGGER "daily_plan_item_events_append_only_trigger" BEFORE UPDATE OR DELETE ON "public"."daily_plan_item_events" FOR EACH ROW EXECUTE FUNCTION "public"."reject_immutable_study_plan_mutation"();
