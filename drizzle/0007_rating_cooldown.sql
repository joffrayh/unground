ALTER TABLE "ratings" ADD COLUMN "cooldown_min" smallint;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "cooldown_temp_c" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_cooldown_min" CHECK ("ratings"."cooldown_min" BETWEEN 0 AND 240);--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_cooldown_temp" CHECK ("ratings"."cooldown_temp_c" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_cooldown_one" CHECK (num_nonnulls("ratings"."cooldown_min", "ratings"."cooldown_temp_c") <= 1);