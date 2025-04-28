CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"npcs" json NOT NULL,
	"locations" json NOT NULL,
	"quests" json NOT NULL,
	"starting_location" text NOT NULL,
	"current_location" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"class" text NOT NULL,
	"background" text NOT NULL,
	"alignment" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"ability_scores" json NOT NULL,
	"max_hp" integer NOT NULL,
	"current_hp" integer NOT NULL,
	"max_force_points" integer DEFAULT 0 NOT NULL,
	"current_force_points" integer DEFAULT 0 NOT NULL,
	"armor_class" integer NOT NULL,
	"speed" integer DEFAULT 30 NOT NULL,
	"equipment" json NOT NULL,
	"custom_items" json,
	"backstory" text,
	"starting_location" text NOT NULL,
	"notes" text,
	"experience" integer DEFAULT 0 NOT NULL,
	"skill_proficiencies" json NOT NULL,
	"saving_throw_proficiencies" json NOT NULL,
	"credits" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
