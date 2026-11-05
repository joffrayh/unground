CREATE TABLE "brew_plans" (
	"brew_id" uuid PRIMARY KEY NOT NULL,
	"water_temp_c" numeric(4, 1),
	"ratio" numeric(4, 1),
	"grind_setting" numeric(6, 2),
	"pour_count" smallint,
	"agitation" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brew_plans_temp" CHECK ("brew_plans"."water_temp_c" IS NULL OR "brew_plans"."water_temp_c" BETWEEN 0 AND 100),
	CONSTRAINT "brew_plans_ratio" CHECK ("brew_plans"."ratio" IS NULL OR "brew_plans"."ratio" BETWEEN 1 AND 50),
	CONSTRAINT "brew_plans_grind" CHECK ("brew_plans"."grind_setting" IS NULL OR "brew_plans"."grind_setting" >= 0),
	CONSTRAINT "brew_plans_pours" CHECK ("brew_plans"."pour_count" IS NULL OR "brew_plans"."pour_count" BETWEEN 1 AND 50),
	CONSTRAINT "brew_plans_agitation" CHECK ("brew_plans"."agitation" IS NULL OR "brew_plans"."agitation" BETWEEN 0 AND 5),
	CONSTRAINT "brew_plans_nonempty" CHECK (num_nonnulls("brew_plans"."water_temp_c", "brew_plans"."ratio", "brew_plans"."grind_setting", "brew_plans"."pour_count", "brew_plans"."agitation", "brew_plans"."notes") > 0)
);
--> statement-breakpoint
CREATE TABLE "drippers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"material" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drippers_id_user" UNIQUE("id","user_id"),
	CONSTRAINT "drippers_name_nonempty" CHECK (length(trim("drippers"."name")) > 0),
	CONSTRAINT "drippers_material" CHECK ("drippers"."material" IS NULL OR "drippers"."material" IN ('plastic', 'ceramic', 'glass', 'metal'))
);
--> statement-breakpoint
ALTER TABLE "brew_v60" DROP CONSTRAINT "brew_v60_dripper";--> statement-breakpoint
ALTER TABLE "beans" ADD COLUMN "bag_weight_g" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "beans" ADD COLUMN "bag_price" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "brews" ADD COLUMN "dripper_id" uuid;--> statement-breakpoint
ALTER TABLE "brews" ADD COLUMN "agitation" smallint;--> statement-breakpoint
ALTER TABLE "pours" ADD COLUMN "bloom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "astringency" smallint;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "clarity" smallint;--> statement-breakpoint
ALTER TABLE "brew_plans" ADD CONSTRAINT "brew_plans_brew_id_brews_id_fk" FOREIGN KEY ("brew_id") REFERENCES "public"."brews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drippers" ADD CONSTRAINT "drippers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drippers_user_name" ON "drippers" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_dripper_fk" FOREIGN KEY ("dripper_id","user_id") REFERENCES "public"."drippers"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beans" ADD CONSTRAINT "beans_bag_weight" CHECK ("beans"."bag_weight_g" IS NULL OR ("beans"."bag_weight_g" > 0 AND "beans"."bag_weight_g" <= 10000));--> statement-breakpoint
ALTER TABLE "beans" ADD CONSTRAINT "beans_bag_price" CHECK ("beans"."bag_price" IS NULL OR ("beans"."bag_price" >= 0 AND "beans"."bag_price" <= 100000));--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_agitation" CHECK ("brews"."agitation" IS NULL OR "brews"."agitation" BETWEEN 0 AND 5);--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_astringency" CHECK ("ratings"."astringency" IS NULL OR "ratings"."astringency" BETWEEN 1 AND 10);--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_clarity" CHECK ("ratings"."clarity" IS NULL OR "ratings"."clarity" BETWEEN 1 AND 10);--> statement-breakpoint
-- Data backfill. It comes after every ALTER of brews and pours, and checks the deferred V60
-- invariants immediately: pending trigger events on a table make Postgres refuse to ALTER it later
-- in the same transaction (SQLSTATE 55006).
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
-- Data (D23): every dripper material a user recorded becomes one of their drippers, and their brews
-- point at it, so no recorded equipment is lost when brew_v60.dripper_material is dropped.
INSERT INTO "drippers" ("user_id", "name", "material")
SELECT DISTINCT b."user_id", 'V60 (' || v."dripper_material" || ')', v."dripper_material"
FROM "brew_v60" v JOIN "brews" b ON b."id" = v."brew_id"
WHERE v."dripper_material" IS NOT NULL;--> statement-breakpoint
UPDATE "brews" b SET "dripper_id" = d."id"
FROM "brew_v60" v, "drippers" d
WHERE v."brew_id" = b."id" AND v."dripper_material" IS NOT NULL
	AND d."user_id" = b."user_id" AND d."material" = v."dripper_material";--> statement-breakpoint
-- Data (D27): until now pour 1 was the bloom by definition (D12), except in a single-pour brew,
-- which had no bloom.
UPDATE "pours" SET "bloom" = true WHERE "idx" = 1
	AND "brew_id" IN (SELECT "brew_id" FROM "pours" GROUP BY "brew_id" HAVING count(*) > 1);--> statement-breakpoint
ALTER TABLE "brew_v60" DROP COLUMN "dripper_material";--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;
