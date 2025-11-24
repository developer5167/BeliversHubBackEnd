// src/routes/posts.ts
import express from "express";
import { db } from "../db";
import { posts } from "../db/schema/posts"; // your drizzle schema file path
import { moderationQueue, enqueueModerationJob } from "../queue/queue";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * POST /posts/create
 * Body (application/json):
 * {
 *   "userId": "<uuid>",
 *   "mediaUrl": "<s3/path/or/local/path>",
 *   "thumbnailUrl": "<s3/path/or-local/path>",
 *   "caption": "string",
 *   "hashtags": ["a","b"],
 *   "location": "Hyderabad",
 *   "mediaType": "video"
 * }
 */
router.post("/create", async (req, res) => {
  try {
    const {
      userId,
      mediaUrl,
      thumbnailUrl,
      caption,
      hashtags,
      location,
      mediaType,
    } = req.body;

    // Basic validation (expand as needed)
    if (!userId || !mediaUrl || !mediaType) {
      return res.status(400).json({ error: "userId, mediaUrl and mediaType are required" });
    }

    // create post id
    const postId = uuidv4();

    // Insert into posts table with status = PENDING
    await db.insert(posts).values({
      id: postId,
      userId,
      mediaUrl,
      thumbnailUrl: thumbnailUrl || null,
      caption: caption || null,
      hashtags: Array.isArray(hashtags) ? hashtags : [],
      location: location || null,
      mediaType,
      status: "PENDING",
      // createdAt/updatedAt handled by DB defaults
    }).execute();

    // Enqueue moderation job payload (include everything worker needs)
    const jobPayload = {
      postId,
      userId,
      mediaUrl,
      thumbnailUrl,
      caption,
      hashtags,
      location,
      mediaType,
      createdAt: new Date().toISOString(),
    };

    await enqueueModerationJob(jobPayload);

    return res.status(201).json({ postId, status: "PENDING" });
  } catch (err) {
    console.error("Create post error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
