ALTER TABLE "brew_v60" DROP CONSTRAINT "brew_v60_filter";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_acidity";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_sweetness";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_body";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_bitterness";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_astringency";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_clarity";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_aftertaste";--> statement-breakpoint
ALTER TABLE "brews" ADD COLUMN "slow_fed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Data backfill. It comes after every ALTER of brews, and checks the deferred V60 invariants
-- immediately: pending trigger events on a table make Postgres refuse to ALTER it later in the same
-- transaction (SQLSTATE 55006). Brews from before slow feeding was asked take the column default, false.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
-- Data (D56): Cafec splits by paper; every Cafec brew so far used Abaca.
UPDATE "brew_v60" SET "filter_type" = 'cafec_abaca' WHERE "filter_type" = 'cafec';--> statement-breakpoint
-- Data (D55): the taste profile moves to half steps. Scores halved from 1–10 already sit on them; a
-- quarter entered since rounds up.
UPDATE "ratings" SET "acidity" = round("acidity" * 2) / 2, "sweetness" = round("sweetness" * 2) / 2, "body" = round("body" * 2) / 2, "bitterness" = round("bitterness" * 2) / 2, "astringency" = round("astringency" * 2) / 2, "clarity" = round("clarity" * 2) / 2, "aftertaste" = round("aftertaste" * 2) / 2;--> statement-breakpoint
ALTER TABLE "brew_v60" ADD CONSTRAINT "brew_v60_filter" CHECK ("brew_v60"."filter_type" IS NULL OR "brew_v60"."filter_type" IN ('hario_tabbed', 'hario_tabless', 'cafec_t90', 'cafec_t92', 'cafec_abaca', 'sibarist', 'other'));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_acidity" CHECK ("ratings"."acidity" IS NULL OR ("ratings"."acidity" BETWEEN 0.5 AND 5 AND mod("ratings"."acidity", 0.5) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_sweetness" CHECK ("ratings"."sweetness" IS NULL OR ("ratings"."sweetness" BETWEEN 0.5 AND 5 AND mod("ratings"."sweetness", 0.5) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_body" CHECK ("ratings"."body" IS NULL OR ("ratings"."body" BETWEEN 0.5 AND 5 AND mod("ratings"."body", 0.5) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_bitterness" CHECK ("ratings"."bitterness" IS NULL OR ("ratings"."bitterness" BETWEEN 0.5 AND 5 AND mod("ratings"."bitterness", 0.5) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_astringency" CHECK ("ratings"."astringency" IS NULL OR ("ratings"."astringency" BETWEEN 0.5 AND 5 AND mod("ratings"."astringency", 0.5) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_clarity" CHECK ("ratings"."clarity" IS NULL OR ("ratings"."clarity" BETWEEN 0.5 AND 5 AND mod("ratings"."clarity", 0.5) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_aftertaste" CHECK ("ratings"."aftertaste" IS NULL OR ("ratings"."aftertaste" BETWEEN 0.5 AND 5 AND mod("ratings"."aftertaste", 0.5) = 0));--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;
