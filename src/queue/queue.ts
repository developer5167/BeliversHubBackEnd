// src/queue.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379");

export const moderationQueue = new Queue("moderation", { connection });

// Helper to add job
export async function enqueueModerationJob(payload: any) {
  // jobId could be the postId for idempotency
  const job = await moderationQueue.add("moderate", payload, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
  return job;
}
