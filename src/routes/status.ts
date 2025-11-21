// src/routes/status.ts
import express from "express";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";
import { requireAuth, AuthRequest } from "../middleware/authMiddleware";
dotenv.config();

import { db } from "../db/index";
import { upload_sessions, media as mediaTable, media_variants as variantsTable, thumbnails as thumbnailsTable } from "../db/schema";

const router = express.Router();

router.use(requireAuth);

/**
 * GET /api/posts/upload-status/:uploadId
 * Returns upload processing status and (if done) media + variants + thumbnails
 */
router.get("/upload-status/:uploadId", async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.user.id;

    if (!uploadId) return res.status(400).json({ error: "missing_uploadId" });

    // fetch upload session
    const sessions = await db
      .select()
      .from(upload_sessions)
      .where(eq(upload_sessions.upload_id, uploadId))
      .execute();

    const session = sessions[0];
    if (!session) return res.status(404).json({ error: "upload_not_found" });

    // security: ensure the requester owns the upload
    if (session.user_id !== userId) return res.status(403).json({ error: "forbidden" });

    const status = session.status;

    // base response
    const response: any = { status };

    if (status === "done") {
      // find media linked to this upload_session
      const medias = await db
        .select()
        .from(mediaTable)
        .where(eq(mediaTable.upload_session_id, session.id))
        .execute();

      const media = medias[0];
      if (!media) {
        // weird edge-case: session marked done but no media row — return status only
        return res.json(response);
      }

      // fetch variants & thumbnails
      const variants = await db
        .select()
        .from(variantsTable)
        .where(eq(variantsTable.media_id, media.id))
        .execute();

      const thumbs = await db
        .select()
        .from(thumbnailsTable)
        .where(eq(thumbnailsTable.media_id, media.id))
        .execute();

      response.media = {
        id: media.id,
        duration_sec: media.duration_sec,
        width: media.width,
        height: media.height,
        variants: variants.map((v: any) => ({
          id: v.id,
          quality: v.quality,
          url: v.url,
          size_bytes: v.size_bytes,
        })),
        thumbnails: thumbs.map((t: any) => ({
          id: t.id,
          url: t.url,
          is_selected: t.is_selected,
        })),
      };
    }

    // for statuses other than done, include minimal info (optional)
    return res.json(response);
  } catch (err) {
    console.error("upload-status err:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
