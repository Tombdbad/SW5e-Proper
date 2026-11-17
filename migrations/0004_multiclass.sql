ALTER TABLE "characters" ADD COLUMN "multiclass" json;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "max_other_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "current_other_points" integer DEFAULT 0 NOT NULL;