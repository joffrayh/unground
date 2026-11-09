CREATE TABLE "scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scales_id_user" UNIQUE("id","user_id"),
	CONSTRAINT "scales_name_nonempty" CHECK (length(trim("scales"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "scales" ADD CONSTRAINT "scales_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scales_user_name" ON "scales" USING btree ("user_id",lower("name"));