CREATE TABLE "watch_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"watched_seconds" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
