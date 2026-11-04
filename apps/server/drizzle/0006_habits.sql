CREATE TABLE "habit_checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"habit_id" text NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"schedule" jsonb NOT NULL,
	"min_minutes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_type";--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_checkins_habit_id_date_index" ON "habit_checkins" USING btree ("habit_id","date");--> statement-breakpoint
CREATE INDEX "habit_checkins_user_id_date_index" ON "habit_checkins" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "habits_user_id_index" ON "habits" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_type" CHECK ("activity"."type" in ('task_completed', 'task_reopened', 'task_triaged', 'item_created', 'next_action_set', 'focus_completed', 'quest_completed', 'quest_bonus', 'habit_checked'));