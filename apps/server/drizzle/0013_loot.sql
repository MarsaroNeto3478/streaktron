CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_key" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"loot_box_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loot_boxes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"quest_id" text,
	"tier" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone,
	"item_key" text,
	"rarity" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loot_boxes_tier" CHECK ("loot_boxes"."tier" in ('small', 'standard', 'large', 'special')),
	CONSTRAINT "loot_boxes_rarity" CHECK ("loot_boxes"."rarity" is null or "loot_boxes"."rarity" in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
	CONSTRAINT "loot_boxes_opened" CHECK (("loot_boxes"."opened_at" is null) = ("loot_boxes"."item_key" is null) and ("loot_boxes"."item_key" is null) = ("loot_boxes"."rarity" is null))
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_loot_box_id_loot_boxes_id_fk" FOREIGN KEY ("loot_box_id") REFERENCES "public"."loot_boxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_boxes" ADD CONSTRAINT "loot_boxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_boxes" ADD CONSTRAINT "loot_boxes_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_items_user_id_item_key_index" ON "inventory_items" USING btree ("user_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_box" ON "inventory_items" USING btree ("loot_box_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loot_boxes_quest" ON "loot_boxes" USING btree ("quest_id");--> statement-breakpoint
CREATE INDEX "loot_boxes_user_id_opened_at_index" ON "loot_boxes" USING btree ("user_id","opened_at");