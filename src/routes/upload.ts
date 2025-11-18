// src/routes/upload.ts
import express from "express";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
dotenv.config();
import { eq } from "drizzle-orm";

import { db } from "../db/index";
import { upload_sessions } from "../db/schema";
import { getPresignedUploadUrl, headObject } from "../s3Client";
import { Queue } from "bullmq";

const router = express.Router();
const BUCKET = process.env.R2_BUCKET!;
const UPLOAD_EXPIRES = Number(process.env.UPLOAD_URL_EXPIRES || 900);

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
};
const processingQueue = new Queue("video-processing", { connection });

// Middleware advice: replace with real auth
function authMiddleware(req: any, res: any, next: any) {
  // temporary: set req.user
  // In production, set from JWT/session
  if (!req.headers["x-user-id"])
    return res.status(401).json({ error: "set X-User-Id header for testing" });
  req.user = { id: Number(req.headers["x-user-id"]) };
  next();
}

router.use(authMiddleware);

/**
 * Request a presigned URL for uploading a video directly to R2
 * Body:
 *  - filename
 *  - contentType
 *  - fileSize
 */
router.post("/request-video-upload", async (req, res) => {
  try {
    const userId = req.user.id;
    const { filename, contentType, fileSize } = req.body;
    if (!filename || !contentType || !fileSize)
      return res.status(400).json({ error: "missing_params" });

    const allowed = ["video/mp4", "video/quicktime", "video/webm", "video/ogg"];
    if (!allowed.includes(contentType))
      return res.status(400).json({ error: "invalid_content_type" });

    // size limit example: 1GB
    const MAX_SIZE = 1024 * 1024 * 1024;
    if (Number(fileSize) > MAX_SIZE)
      return res.status(400).json({ error: "file_too_large" });

    const uploadId = randomUUID();
    const fileKey = `uploads/${userId}/${uploadId}/${uploadId}-${filename}`;

    // insert upload session
    await db
      .insert(upload_sessions)
      .values({
        user_id: userId,
        upload_id: uploadId,
        file_key: fileKey,
        file_size: Number(fileSize),
        mime_type: contentType,
        status: "initiated",
      })
      .execute();

    const url = await getPresignedUploadUrl(
      BUCKET,
      fileKey,
      contentType,
      UPLOAD_EXPIRES
    );

    return res.json({
      uploadId,
      fileKey,
      uploadUrl: url,
      expiresIn: UPLOAD_EXPIRES,
    });
  } catch (err) {
    console.error("request-video-upload err:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

/**
 * Complete upload: client notifies server after uploading to R2
 * Body:
 *  - uploadId
 *  - fileKey
 */
router.post("/complete-video-upload", async (req, res) => {
  try {
    const userId = req.user.id;
    const { uploadId, fileKey } = req.body;
    if (!uploadId || !fileKey)
      return res.status(400).json({ error: "missing_params" });

    // find session
    const rows = await db
  .select()
  .from(upload_sessions)
  .where(eq(upload_sessions.upload_id, uploadId))
  .execute();

const found = rows[0];
if (!found) return res.status(404).json({ error: "upload_not_found" });

if (found.user_id !== userId) {
  return res.status(403).json({ error: "forbidden" });
}

    // check object exists in R2
    try {
      const head = await headObject(BUCKET, fileKey);
      // optionally check content-length vs stored file_size
    } catch (err) {
      console.error("headObject err:", err);
      return res.status(400).json({ error: "object_not_found_in_storage" });
    }

    // update session to uploaded
    await db
      .update(upload_sessions)
      .set({ status: "uploaded" })
      .where(eq(upload_sessions.upload_id, uploadId)).execute();
    // enqueue processing job
    await processingQueue.add("transcode", {
      uploadSessionId: found.id,
      uploadId,
      fileKey,
      userId,
      bucket: BUCKET,
    });

    // set status processing
    await db
      .update(upload_sessions)
      .set({ status: "processing", updated_at: new Date() })
      .where(eq(upload_sessions.upload_id, uploadId))
      .execute();

    return res.json({ ok: true, message: "enqueued" });
  } catch (err) {
    console.error("complete-video-upload err:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
