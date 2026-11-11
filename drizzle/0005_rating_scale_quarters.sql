-- D55: scores move from 1–10 to 0.25–5 in quarters. Halving converts every old score exactly
-- (1 → 0.5, 7 → 3.5, 10 → 5), so it can be undone by doubling.
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_overall";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_acidity";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_sweetness";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_body";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_bitterness";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_astringency";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_clarity";--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_aftertaste";--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "overall" SET DATA TYPE numeric(3, 2) USING "overall" / 2.0;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "acidity" SET DATA TYPE numeric(3, 2) USING "acidity" / 2.0;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "sweetness" SET DATA TYPE numeric(3, 2) USING "sweetness" / 2.0;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "body" SET DATA TYPE numeric(3, 2) USING "body" / 2.0;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "bitterness" SET DATA TYPE numeric(3, 2) USING "bitterness" / 2.0;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "astringency" SET DATA TYPE numeric(3, 2) USING "astringency" / 2.0;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "clarity" SET DATA TYPE numeric(3, 2) USING "clarity" / 2.0;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "aftertaste" SET DATA TYPE numeric(3, 2) USING "aftertaste" / 2.0;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_overall" CHECK ("ratings"."overall" BETWEEN 0.25 AND 5 AND mod("ratings"."overall", 0.25) = 0);--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_acidity" CHECK ("ratings"."acidity" IS NULL OR ("ratings"."acidity" BETWEEN 0.25 AND 5 AND mod("ratings"."acidity", 0.25) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_sweetness" CHECK ("ratings"."sweetness" IS NULL OR ("ratings"."sweetness" BETWEEN 0.25 AND 5 AND mod("ratings"."sweetness", 0.25) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_body" CHECK ("ratings"."body" IS NULL OR ("ratings"."body" BETWEEN 0.25 AND 5 AND mod("ratings"."body", 0.25) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_bitterness" CHECK ("ratings"."bitterness" IS NULL OR ("ratings"."bitterness" BETWEEN 0.25 AND 5 AND mod("ratings"."bitterness", 0.25) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_astringency" CHECK ("ratings"."astringency" IS NULL OR ("ratings"."astringency" BETWEEN 0.25 AND 5 AND mod("ratings"."astringency", 0.25) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_clarity" CHECK ("ratings"."clarity" IS NULL OR ("ratings"."clarity" BETWEEN 0.25 AND 5 AND mod("ratings"."clarity", 0.25) = 0));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_aftertaste" CHECK ("ratings"."aftertaste" IS NULL OR ("ratings"."aftertaste" BETWEEN 0.25 AND 5 AND mod("ratings"."aftertaste", 0.25) = 0));