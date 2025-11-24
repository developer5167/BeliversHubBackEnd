CREATE TYPE "public"."post_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_MANUAL_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('ALLOW', 'BLOCK', 'REVIEW');--> statement-breakpoint
CREATE TABLE "moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_job_id" text,
	"result_json" jsonb,
	"verdict" "verdict" NOT NULL,
	"confidence" real,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_url" text NOT NULL,
	"thumbnail_url" text,
	"caption" text,
	"hashtags" text[] DEFAULT '{}',
	"location" text,
	"media_type" varchar(20) NOT NULL,
	"status" "post_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" uuid,
	"reason_rejected" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"provider" varchar(50) NOT NULL,
	"provider_id" varchar(300) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtags" (
	"id" serial PRIMARY KEY NOT NULL,
	"tag" varchar(128) NOT NULL,
	"category" varchar(128) DEFAULT 'general'
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" uuid,
	"upload_session_id" integer,
	"type" varchar(16) NOT NULL,
	"duration_sec" integer DEFAULT 0,
	"width" integer DEFAULT 0,
	"height" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_id" integer,
	"quality" varchar(64) NOT NULL,
	"url" text NOT NULL,
	"size_bytes" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"token_hash" varchar(512) NOT NULL,
	"revoked" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thumbnails" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_id" integer,
	"url" text NOT NULL,
	"is_selected" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"upload_id" varchar(64) NOT NULL,
	"file_key" varchar(1024) NOT NULL,
	"file_size" integer DEFAULT 0,
	"mime_type" varchar(128) DEFAULT '',
	"status" varchar(32) DEFAULT 'initiated',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200),
	"username" varchar(200) NOT NULL,
	"avatar_url" text,
	"bio" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_providers" ADD CONSTRAINT "auth_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_upload_session_id_upload_sessions_id_fk" FOREIGN KEY ("upload_session_id") REFERENCES "public"."upload_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thumbnails" ADD CONSTRAINT "thumbnails_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");