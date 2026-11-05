CREATE TABLE "bean_roaster_notes" (
	"bean_id" uuid NOT NULL,
	"flavor_id" text NOT NULL,
	CONSTRAINT "bean_roaster_notes_bean_id_flavor_id_pk" PRIMARY KEY("bean_id","flavor_id")
);
--> statement-breakpoint
CREATE TABLE "beans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"roaster_id" uuid NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"farm" text,
	"altitude_min_m" integer,
	"altitude_max_m" integer,
	"process" text,
	"roast_level" text,
	"roast_date" date,
	"decaf" boolean DEFAULT false NOT NULL,
	"stored_frozen" boolean DEFAULT false NOT NULL,
	"roaster_notes_raw" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beans_id_user" UNIQUE("id","user_id"),
	CONSTRAINT "beans_name_nonempty" CHECK (length(trim("beans"."name")) > 0),
	CONSTRAINT "beans_country" CHECK ("beans"."country" IS NULL OR "beans"."country" IN ('BO', 'BR', 'BI', 'CM', 'CN', 'CO', 'CD', 'CR', 'CU', 'DO', 'EC', 'SV', 'ET', 'GT', 'HT', 'HN', 'IN', 'ID', 'JM', 'KE', 'LA', 'MG', 'MW', 'MX', 'MM', 'NP', 'NI', 'PA', 'PG', 'PE', 'PH', 'RW', 'TZ', 'TH', 'TL', 'UG', 'US', 'VE', 'VN', 'YE', 'ZM', 'ZW')),
	CONSTRAINT "beans_process" CHECK ("beans"."process" IS NULL OR "beans"."process" IN ('washed', 'natural', 'honey', 'anaerobic', 'carbonic_maceration', 'co_ferment', 'wet_hulled', 'other')),
	CONSTRAINT "beans_roast_level" CHECK ("beans"."roast_level" IS NULL OR "beans"."roast_level" IN ('light', 'medium_light', 'medium', 'medium_dark', 'dark')),
	CONSTRAINT "beans_altitude" CHECK (("beans"."altitude_min_m" IS NULL OR "beans"."altitude_min_m" BETWEEN 0 AND 4000)
			AND ("beans"."altitude_max_m" IS NULL OR "beans"."altitude_max_m" BETWEEN 0 AND 4000)
			AND ("beans"."altitude_min_m" IS NULL OR "beans"."altitude_max_m" IS NULL OR "beans"."altitude_min_m" <= "beans"."altitude_max_m"))
);
--> statement-breakpoint
CREATE TABLE "brew_v60" (
	"brew_id" uuid PRIMARY KEY NOT NULL,
	"method" text DEFAULT 'v60' NOT NULL,
	"dripper_material" text,
	"filter_type" text,
	CONSTRAINT "brew_v60_method" CHECK ("brew_v60"."method" = 'v60'),
	CONSTRAINT "brew_v60_dripper" CHECK ("brew_v60"."dripper_material" IS NULL OR "brew_v60"."dripper_material" IN ('plastic', 'ceramic', 'glass', 'metal')),
	CONSTRAINT "brew_v60_filter" CHECK ("brew_v60"."filter_type" IS NULL OR "brew_v60"."filter_type" IN ('hario_tabbed', 'hario_tabless', 'cafec', 'sibarist', 'other'))
);
--> statement-breakpoint
CREATE TABLE "brews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bean_id" uuid NOT NULL,
	"grinder_id" uuid NOT NULL,
	"method" text NOT NULL,
	"brewed_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"grind_setting" numeric(6, 2) NOT NULL,
	"dose_g" numeric(5, 1) NOT NULL,
	"water_g" numeric(6, 1) NOT NULL,
	"water_temp_c" numeric(4, 1) NOT NULL,
	"total_time_s" integer NOT NULL,
	"changed" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brews_id_method" UNIQUE("id","method"),
	CONSTRAINT "brews_method" CHECK ("brews"."method" IN ('v60')),
	CONSTRAINT "brews_grind" CHECK ("brews"."grind_setting" >= 0),
	CONSTRAINT "brews_dose" CHECK ("brews"."dose_g" > 0 AND "brews"."dose_g" <= 200),
	CONSTRAINT "brews_water" CHECK ("brews"."water_g" > 0 AND "brews"."water_g" <= 5000),
	CONSTRAINT "brews_temp" CHECK ("brews"."water_temp_c" BETWEEN 0 AND 100),
	CONSTRAINT "brews_time" CHECK ("brews"."total_time_s" > 0 AND "brews"."total_time_s" <= 3600),
	CONSTRAINT "brews_changed" CHECK ("brews"."changed" <@ ARRAY['nothing', 'grind', 'dose', 'water', 'temperature', 'pours', 'bean', 'equipment', 'technique']::text[])
);
--> statement-breakpoint
CREATE TABLE "flavors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"tier" smallint NOT NULL,
	CONSTRAINT "flavors_tier" CHECK ("flavors"."tier" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "grinders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"setting_unit" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grinders_id_user" UNIQUE("id","user_id"),
	CONSTRAINT "grinders_name_nonempty" CHECK (length(trim("grinders"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "pours" (
	"brew_id" uuid NOT NULL,
	"idx" smallint NOT NULL,
	"volume_g" numeric(6, 1) NOT NULL,
	"interval_s" integer NOT NULL,
	CONSTRAINT "pours_brew_id_idx_pk" PRIMARY KEY("brew_id","idx"),
	CONSTRAINT "pours_idx" CHECK ("pours"."idx" BETWEEN 1 AND 50),
	CONSTRAINT "pours_volume" CHECK ("pours"."volume_g" > 0),
	CONSTRAINT "pours_interval" CHECK (("pours"."idx" = 1 AND "pours"."interval_s" = 0) OR ("pours"."idx" > 1 AND "pours"."interval_s" > 0))
);
--> statement-breakpoint
CREATE TABLE "rating_perceived_notes" (
	"brew_id" uuid NOT NULL,
	"flavor_id" text NOT NULL,
	CONSTRAINT "rating_perceived_notes_brew_id_flavor_id_pk" PRIMARY KEY("brew_id","flavor_id")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"brew_id" uuid PRIMARY KEY NOT NULL,
	"overall" smallint NOT NULL,
	"acidity" smallint,
	"sweetness" smallint,
	"body" smallint,
	"bitterness" smallint,
	"aftertaste" smallint,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_overall" CHECK ("ratings"."overall" BETWEEN 1 AND 10),
	CONSTRAINT "ratings_acidity" CHECK ("ratings"."acidity" IS NULL OR "ratings"."acidity" BETWEEN 1 AND 10),
	CONSTRAINT "ratings_sweetness" CHECK ("ratings"."sweetness" IS NULL OR "ratings"."sweetness" BETWEEN 1 AND 10),
	CONSTRAINT "ratings_body" CHECK ("ratings"."body" IS NULL OR "ratings"."body" BETWEEN 1 AND 10),
	CONSTRAINT "ratings_bitterness" CHECK ("ratings"."bitterness" IS NULL OR "ratings"."bitterness" BETWEEN 1 AND 10),
	CONSTRAINT "ratings_aftertaste" CHECK ("ratings"."aftertaste" IS NULL OR "ratings"."aftertaste" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "roasters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roasters_id_user" UNIQUE("id","user_id"),
	CONSTRAINT "roasters_name_nonempty" CHECK (length(trim("roasters"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "bean_roaster_notes" ADD CONSTRAINT "bean_roaster_notes_bean_id_beans_id_fk" FOREIGN KEY ("bean_id") REFERENCES "public"."beans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bean_roaster_notes" ADD CONSTRAINT "bean_roaster_notes_flavor_id_flavors_id_fk" FOREIGN KEY ("flavor_id") REFERENCES "public"."flavors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beans" ADD CONSTRAINT "beans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beans" ADD CONSTRAINT "beans_roaster_fk" FOREIGN KEY ("roaster_id","user_id") REFERENCES "public"."roasters"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_v60" ADD CONSTRAINT "brew_v60_brew_fk" FOREIGN KEY ("brew_id","method") REFERENCES "public"."brews"("id","method") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_bean_fk" FOREIGN KEY ("bean_id","user_id") REFERENCES "public"."beans"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_grinder_fk" FOREIGN KEY ("grinder_id","user_id") REFERENCES "public"."grinders"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flavors" ADD CONSTRAINT "flavors_parent_id_flavors_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."flavors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grinders" ADD CONSTRAINT "grinders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pours" ADD CONSTRAINT "pours_brew_id_brews_id_fk" FOREIGN KEY ("brew_id") REFERENCES "public"."brews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_perceived_notes" ADD CONSTRAINT "rating_perceived_notes_brew_id_ratings_brew_id_fk" FOREIGN KEY ("brew_id") REFERENCES "public"."ratings"("brew_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_perceived_notes" ADD CONSTRAINT "rating_perceived_notes_flavor_id_flavors_id_fk" FOREIGN KEY ("flavor_id") REFERENCES "public"."flavors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_brew_id_brews_id_fk" FOREIGN KEY ("brew_id") REFERENCES "public"."brews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roasters" ADD CONSTRAINT "roasters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beans_user_idx" ON "beans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "brews_user_brewed_idx" ON "brews" USING btree ("user_id","brewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "brews_bean_idx" ON "brews" USING btree ("bean_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grinders_user_name" ON "grinders" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "roasters_user_name" ON "roasters" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");