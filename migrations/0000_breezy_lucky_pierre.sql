CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"setting" json NOT NULL,
	"character_id" integer,
	"player_characters" json,
	"objectives" json,
	"quests" json NOT NULL,
	"arcs" json,
	"factions" json,
	"npcs" json NOT NULL,
	"locations" json NOT NULL,
	"planets" json,
	"starting_location" text NOT NULL,
	"current_location" text,
	"galaxy_map" json,
	"time_elapsed" json,
	"in_game_calendar" json,
	"current_game_state" json,
	"session_logs" json,
	"upcoming_session_notes" json,
	"notes" text,
	"secrets" json,
	"encounters" json,
	"treasures" json,
	"llm_context" json,
	"ai_direction" json,
	"force_presence" json,
	"starships" json,
	"tech_level" json,
	"faction_influence" json,
	"planetary_conditions" json,
	"available_resources" json,
	"special_rules" json
);
--> statement-breakpoint
CREATE TABLE "character_star_wars_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer,
	"species" text,
	"homeworld" text,
	"affiliation" text,
	"force_user" boolean DEFAULT false,
	"force_powers" jsonb,
	"custom_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"class" text NOT NULL,
	"subclass" text,
	"level" integer DEFAULT 1 NOT NULL,
	"background" text NOT NULL,
	"alignment" text NOT NULL,
	"ability_scores" json NOT NULL,
	"proficiency_bonus" integer DEFAULT 2 NOT NULL,
	"max_hp" integer NOT NULL,
	"current_hp" integer NOT NULL,
	"temporary_hp" integer DEFAULT 0 NOT NULL,
	"armor_class" integer NOT NULL,
	"max_force_points" integer DEFAULT 0 NOT NULL,
	"current_force_points" integer DEFAULT 0 NOT NULL,
	"force_powers" json,
	"tech_powers" json,
	"speed" integer DEFAULT 30 NOT NULL,
	"initiative" integer,
	"saving_throw_proficiencies" json NOT NULL,
	"skill_proficiencies" json NOT NULL,
	"tool_proficiencies" json,
	"weapon_proficiencies" json,
	"armor_proficiencies" json,
	"languages" json,
	"credits" integer DEFAULT 1000 NOT NULL,
	"equipment" json NOT NULL,
	"weapons" json,
	"armor" json,
	"custom_items" json,
	"encumbrance" integer DEFAULT 0,
	"carrying_capacity" integer,
	"personality_traits" json,
	"ideals" json,
	"bonds" json,
	"flaws" json,
	"backstory" text,
	"notes" text,
	"campaign_id" integer,
	"experience" integer DEFAULT 0 NOT NULL,
	"starting_location" text NOT NULL,
	"current_location" text,
	"faction_reputations" json,
	"force_alignment" text,
	"deployments" json,
	"modifications" json,
	"companion_data" json,
	"conditions" json,
	"exhaustion_level" integer DEFAULT 0,
	"feats" json,
	"fighter_maneuvers" json,
	"scholar_formulae" json
);
--> statement-breakpoint
CREATE TABLE "debriefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"content" json NOT NULL,
	"response" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text,
	"owner_id" integer,
	"location_id" integer,
	"campaign_id" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"coordinate_string" text NOT NULL,
	"coordinate_data" jsonb,
	"campaign_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "npcs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"species" text,
	"description" text,
	"location_id" integer,
	"campaign_id" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_star_wars_data" ADD CONSTRAINT "character_star_wars_data_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_characters_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;