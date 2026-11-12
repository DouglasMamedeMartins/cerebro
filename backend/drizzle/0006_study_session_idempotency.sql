ALTER TABLE "study_sessions" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "request_fingerprint" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "study_sessions_candidate_idempotency_unique" ON "study_sessions" USING btree ("candidate_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_idempotency_fields_paired" CHECK (("study_sessions"."idempotency_key" IS NULL) = ("study_sessions"."request_fingerprint" IS NULL));