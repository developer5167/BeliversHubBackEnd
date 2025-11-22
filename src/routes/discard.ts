// src/routes/discard.ts
import express from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import {
  upload_sessions,
  media as mediaTable,
  media_variants as variantsTable,
  thumbnails as thumbnailsTable,
} from "../db/schema";
import { s3 } from "../s3Client";
import { DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();
import { requireAuth, AuthRequest } from "../middleware/authMiddleware";
const router = express.Router();
const BUCKET = process.env.R2_BUCKET!;
// same simple auth

router.use(requireAuth);

/**
 * DELETE /api/posts/discard-upload/:uploadId
 */
router.delete("/discard-upload", async (req: AuthRequest, res) => {
  try {
    const { uploadId } = req.body;
    const userId = req.user.id;

    if (!uploadId) return res.status(400).json({ error: "missing_uploadId" });

    // 1. Find upload session
    const sessions = await db
      .select()
      .from(upload_sessions)
      .where(eq(upload_sessions.upload_id, uploadId))
      .execute();

    const session = sessions[0];
    if (!session) return res.status(404).json({ error: "not_found" });

    if (session.user_id !== userId)
      return res.status(403).json({ error: "forbidden" });

    // 2. Fetch media linked to session
    const medias = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.upload_session_id, session.id))
      .execute();

    const media = medias[0];

    // GATHER ALL STORAGE PATHS TO DELETE
    let keysToDelete: string[] = [];

    // original uploaded file
    keysToDelete.push(session.file_key);

    if (media) {
      // fetch variants
      const variants = await db
        .select()
        .from(variantsTable)
        .where(eq(variantsTable.media_id, media.id))
        .execute();

      // add variant file keys
      variants.forEach((v) => keysToDelete.push(v.url));

      // thumbnails
      const thumbs = await db
        .select()
        .from(thumbnailsTable)
        .where(eq(thumbnailsTable.media_id, media.id))
        .execute();

      thumbs.forEach((t) => keysToDelete.push(t.url));

      // HLS files (must delete folder)
      const hlsPrefix = `processed/${userId}/${session.id}/hls/`;

      // list all objects under HLS prefix
      const listCmd = new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: hlsPrefix,
      });
      const listed = await s3.send(listCmd);

      if (listed.Contents) {
        listed.Contents.forEach((obj) => obj.Key && keysToDelete.push(obj.Key));
      }
    }

    // 3. DELETE all S3 keys
    for (const key of keysToDelete) {
      if (!key) continue;
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: key,
          })
        );
      } catch (err) {
        console.error("Failed to delete key:", key, err);
      }
    }

    // 4. Delete DB rows
    if (media) {
      await db
        .delete(thumbnailsTable)
        .where(eq(thumbnailsTable.media_id, media.id))
        .execute();

      await db
        .delete(variantsTable)
        .where(eq(variantsTable.media_id, media.id))
        .execute();

      await db
        .delete(mediaTable)
        .where(eq(mediaTable.id, media.id))
        .execute();
    }

    await db
      .delete(upload_sessions)
      .where(eq(upload_sessions.id, session.id))
      .execute();

    return res.json({ ok: true });

  } catch (err) {
    console.error("discard-upload error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
