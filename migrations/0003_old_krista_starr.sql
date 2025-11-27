CREATE TABLE "user_interests" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"interests" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
