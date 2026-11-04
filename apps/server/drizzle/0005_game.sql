CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"entity_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"local_date" date NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "activity_type" CHECK ("activity"."type" in ('task_completed', 'task_reopened', 'task_triaged', 'item_created', 'next_action_set', 'focus_completed', 'quest_completed', 'quest_bonus'))
);
--> statement-breakpoint
CREATE TABLE "focus_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text,
	"project_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"planned_minutes" integer NOT NULL,
	"paused_ms" integer DEFAULT 0 NOT NULL,
	"paused_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"minutes" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "focus_sessions_status" CHECK ("focus_sessions"."status" in ('running', 'paused', 'completed', 'abandoned')),
	CONSTRAINT "focus_sessions_planned" CHECK ("focus_sessions"."planned_minutes" between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"template_key" text NOT NULL,
	"title" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"target" integer NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"reward_xp" integer NOT NULL,
	"box_tier" text NOT NULL,
	"target_entity_id" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_quest_id" text,
	"reroll_of" text,
	"status" text DEFAULT 'offered' NOT NULL,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quests_status" CHECK ("quests"."status" in ('offered', 'completed', 'expired', 'rerolled', 'cancelled')),
	CONSTRAINT "quests_type" CHECK ("quests"."type" in ('quick', 'daily', 'time', 'make', 'follow_up', 'weekly', 'comeback'))
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_parent_quest_id_quests_id_fk" FOREIGN KEY ("parent_quest_id") REFERENCES "public"."quests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_reroll_of_quests_id_fk" FOREIGN KEY ("reroll_of") REFERENCES "public"."quests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_id_local_date_index" ON "activity" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "activity_user_id_type_entity_id_index" ON "activity" USING btree ("user_id","type","entity_id");--> statement-breakpoint
CREATE INDEX "focus_sessions_user_id_started_at_index" ON "focus_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "focus_sessions_one_open" ON "focus_sessions" USING btree ("user_id") WHERE status in ('running', 'paused');--> statement-breakpoint
CREATE INDEX "quests_user_id_status_period_end_index" ON "quests" USING btree ("user_id","status","period_end");--> statement-breakpoint
CREATE INDEX "quests_user_id_period_start_index" ON "quests" USING btree ("user_id","period_start");