ALTER TABLE "daily_plan_item_events" DROP CONSTRAINT "daily_plan_item_events_type_valid";--> statement-breakpoint
ALTER TABLE "daily_plan_item_events" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "daily_plan_item_events" ADD COLUMN "request_fingerprint" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plan_item_events_candidate_idempotency_unique" ON "daily_plan_item_events" USING btree ("candidate_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plan_item_events_one_terminal_per_item_unique" ON "daily_plan_item_events" USING btree ("plan_item_id") WHERE "daily_plan_item_events"."event_type" IN ('completed', 'ignored', 'replaced');--> statement-breakpoint
ALTER TABLE "daily_plan_item_events" ADD CONSTRAINT "daily_plan_item_events_idempotency_fields_paired" CHECK (("daily_plan_item_events"."idempotency_key" IS NULL) = ("daily_plan_item_events"."request_fingerprint" IS NULL));--> statement-breakpoint
ALTER TABLE "daily_plan_item_events" ADD CONSTRAINT "daily_plan_item_events_type_valid" CHECK ("daily_plan_item_events"."event_type" IN ('completed', 'ignored', 'replaced', 'manual_change'));