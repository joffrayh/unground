ALTER TABLE "brews" ADD COLUMN "scale_id" uuid;--> statement-breakpoint
ALTER TABLE "pours" ADD COLUMN "planned_cumulative_g" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "pours" ADD COLUMN "planned_start_s" integer;--> statement-breakpoint
ALTER TABLE "pours" ADD COLUMN "duration_s" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_scale_fk" FOREIGN KEY ("scale_id","user_id") REFERENCES "public"."scales"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pours" ADD CONSTRAINT "pours_planned_g" CHECK ("pours"."planned_cumulative_g" IS NULL OR "pours"."planned_cumulative_g" > 0);--> statement-breakpoint
ALTER TABLE "pours" ADD CONSTRAINT "pours_planned_start" CHECK ("pours"."planned_start_s" IS NULL OR "pours"."planned_start_s" >= 0);--> statement-breakpoint
ALTER TABLE "pours" ADD CONSTRAINT "pours_duration" CHECK ("pours"."duration_s" IS NULL OR "pours"."duration_s" > 0);