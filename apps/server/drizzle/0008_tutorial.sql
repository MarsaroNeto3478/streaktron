ALTER TABLE "quests" DROP CONSTRAINT "quests_type";--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "challenge" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tutorial" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_challenge" CHECK (challenge is null or challenge in ('forgetting', 'next_step', 'missed_day', 'too_many', 'motivation'));--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_tutorial" CHECK (tutorial in ('new', 'question', 'active', 'done', 'closed'));--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_type" CHECK ("quests"."type" in ('quick', 'daily', 'time', 'make', 'follow_up', 'weekly', 'comeback', 'tutorial'));