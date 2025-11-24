import express from "express";
import { db } from "../db/index";
import { posts } from "../db/schema/posts";
import { eq, desc } from "drizzle-orm";

const router = express.Router();

/**
 * GET /feed
 * Returns all approved posts for the home screen
 */
router.get("/", async (req, res) => {
  try {
    const result = await db
      .select()
      .from(posts)
      .where(eq(posts.status, "APPROVED"))
      .orderBy(desc(posts.createdAt));

    return res.json({ data: result });
  } catch (err) {
    console.error("Feed error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
