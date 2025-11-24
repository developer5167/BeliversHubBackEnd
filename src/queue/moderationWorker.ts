// src/queue/moderationWorker.ts

import { Worker } from "bullmq";
import IORedis from "ioredis";
import AWS from "aws-sdk";

import { db } from "../db";
import { posts } from "../db/schema/posts";
import { moderationEvents } from "../db/schema/moderation";
import { eq } from "drizzle-orm";

const redis = new IORedis(process.env.REDIS_URL!);

// Configure AWS Rekognition
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const rekognition = new AWS.Rekognition();

// 🚀 Moderation Worker
export const moderationWorker = new Worker(
  "moderation",
  async (job) => {
    console.log("🔥 AI Moderation Job Started:", job.id);

    const {
      postId,
      mediaUrl,
      thumbnailUrl,
      caption,
      hashtags,
      userId,
      mediaType,
    } = job.data;

    try {
      // ============================
      // 1️⃣ IMAGE MODERATION (cheap)
      // ============================
      // Only check thumbnail for now. Later you can add video moderation.

      const params = {
        Image: {
          S3Object: {
            Bucket: process.env.S3_BUCKET!,
            Name: thumbnailUrl,
          },
        },
        MinConfidence: 70,
      };

      const result = await rekognition.detectModerationLabels(params).promise();

      const labels = result.ModerationLabels || [];

      let verdict: "ALLOW" | "BLOCK" | "REVIEW" = "ALLOW";
      let reason = "";
      let confidence = 0;

      // ============================
      // 2️⃣ Decision Logic
      // ============================
      for (const label of labels) {
        const name = label.Name?.toLowerCase() || "";
        const conf = label.Confidence ?? 0;

        if (conf > confidence) confidence = conf;

        // Directly block content
        if (
          name.includes("nudity") ||
          name.includes("sexual") ||
          name.includes("explicit") ||
          name.includes("suggestive")
        ) {
          verdict = "BLOCK";
          reason = `Detected: ${label.Name}`;
          break;
        }

        // Suspicious but not 100% sure
        if (name.includes("revealing") || name.includes("partial")) {
          verdict = "REVIEW";
          reason = `Possible sensitive content: ${label.Name}`;
        }
      }

      // ============================
      // 3️⃣ Store Moderation Event
      // ============================
      await db.insert(moderationEvents).values({
        postId,
        provider: "aws_rekognition",
        providerJobId: null,
        resultJson: result,
        verdict,
        confidence,
        reason,
      });

      // ============================
      // 4️⃣ Update Post Status
      // ============================
      let newStatus = "APPROVED";

      if (verdict === "BLOCK") newStatus = "REJECTED";
      else if (verdict === "REVIEW") newStatus = "NEEDS_MANUAL_REVIEW";

      await db
        .update(posts)
        .set({
          status: newStatus,
          reviewedAt: new Date(),
          reviewedBy: null, // system
          reasonRejected: verdict === "BLOCK" ? reason : null,
        })
        .where(eq(posts.id, postId));

      console.log(`Post ${postId} → Moderation Verdict: ${verdict}`);
      return { postId, verdict };
    } catch (err) {
      console.error("Moderation worker failed:", err);

      // Send to manual review on failure
      await db
        .update(posts)
        .set({
          status: "NEEDS_MANUAL_REVIEW",
          reviewedAt: new Date(),
        })
        .where(eq(posts.id, job.data.postId));

      throw err;
    }
  },
  {
    connection: redis,
  }
);
