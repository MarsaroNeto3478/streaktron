CREATE TABLE "weekly_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"went_well" text DEFAULT '' NOT NULL,
	"change" text DEFAULT '' NOT NULL,
	"summary" jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_type";--> statement-breakpoint
ALTER TABLE "quests" DROP CONSTRAINT "quests_type";--> statement-breakpoint
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reviews_user_id_week_start_index" ON "weekly_reviews" USING btree ("user_id","week_start");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_type" CHECK ("activity"."type" in ('task_completed', 'task_reopened', 'task_triaged', 'item_created', 'next_action_set', 'focus_completed', 'quest_completed', 'quest_bonus', 'habit_checked', 'review_completed'));--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_type" CHECK ("quests"."type" in ('quick', 'daily', 'time', 'make', 'follow_up', 'weekly', 'comeback', 'tutorial', 'review'));