// src/routes/reels.ts
import express from "express";
import { fetchCandidates, scorePost } from "../services/rankingService";

const router = express.Router();

/**
 * GET /reels
 * Query params:
 *  - limit (default 20)
 *  - interests (comma-separated hashtags without #) e.g. interests=jesus,worship
 *  - location (user city)
 */
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const interests = req.query.interests
      ? String(req.query.interests).split(",").map(s => s.trim().toLowerCase())
      : [];
    const userLocation = req.query.location ? String(req.query.location) : null;

    // 1) fetch candidates
    const candidates = await fetchCandidates(200);

    // 2) score them
    const scored = candidates.map(p => ({
      post: p,
      score: scorePost(p, { interests, userLocation }),
    }));

    // 3) sort & take top `limit`
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit).map(s => ({
      ...s.post,
      score: s.score,
    }));

    return res.json({ data: top });
  } catch (err) {
    console.error("Reels error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
