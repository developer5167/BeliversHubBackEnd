import express from "express";
import { db } from "../db";
import { posts } from "../db/schema/posts";
import { eq } from "drizzle-orm";

const router = express.Router();

// GET pending posts
router.get("/posts/pending", async (req, res) => {
  const results = await db
    .select()
    .from(posts)
    .where(eq(posts.status, "PENDING"));

  return res.json(results);
});

// APPROVE post
router.post("/posts/:postId/approve", async (req, res) => {
  const { postId } = req.params;
  const adminId = req.body.adminId; // send admin id

  await db
    .update(posts)
    .set({
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: adminId,
    })
    .where(eq(posts.id, postId));

  return res.json({ postId, status: "APPROVED" });
});

// REJECT post
router.post("/posts/:postId/reject", async (req, res) => {
  const { postId } = req.params;
  const { adminId, reason } = req.body;

  await db
    .update(posts)
    .set({
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: adminId,
      reasonRejected: reason,
    })
    .where(eq(posts.id, postId));

  return res.json({ postId, status: "REJECTED" });
});

export default router;
