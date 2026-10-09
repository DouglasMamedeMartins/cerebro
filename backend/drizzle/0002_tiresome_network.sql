ALTER TABLE "questions" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "correct_option" varchar(1);