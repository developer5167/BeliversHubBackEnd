import express from "express";
import { watchEvents } from "../db/schema/watchEvents";
import { postMetrics } from "../db/schema/postMetrics";
import { eq, sql } from "drizzle-orm";
import { userInterests } from "../db/schema/userInterests";
import { posts } from "../db/schema/posts";
import { db } from "../db";

const router = express.Router();

router.post("/watch", async (req, res) => {
  try {
    const { userId, postId, watchedSeconds } = req.body;

    if (!userId || !postId || watchedSeconds == null) {
      return res.status(400).json({ error: "missing_fields" });
    }

    // 1) Insert raw watch event
    await db.insert(watchEvents).values({
      userId,
      postId,
      watchedSeconds,
    });

    // 2) Increment views count
    await db
      .update(postMetrics)
      .set({ views: sql`${postMetrics.views} + 1` })
      .where(eq(postMetrics.postId, postId));

    // 3: Update User Interest Vector
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
    }); 

    if (post?.hashtags?.length) {
      const existing = await db.query.userInterests.findFirst({
        where: eq(userInterests.userId, userId),
      });

      let interestVector = existing?.interests || {};

      for (const tag of post.hashtags) {
        const key = tag.toLowerCase();
        const boost = Math.min(watchedSeconds / 30, 1); // Max +1 per watch
        interestVector[key] = (interestVector[key] ?? 0) + boost;
      }

      await db
        .insert(userInterests)
        .values({
          userId,
          interests: interestVector,
        })
        .onConflictDoUpdate({
          target: userInterests.userId,
          set: { interests: interestVector, updatedAt: new Date() },
        });
    }

    // 4) ALWAYS respond
    return res.json({ status: "ok" });

  } catch (err) {
    console.error("Watch error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
