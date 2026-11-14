CREATE TABLE "achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"earned_on" date NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_kind" CHECK ("achievements"."kind" in ('medal', 'prize'))
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_user_key" ON "achievements" USING btree ("user_id","key");