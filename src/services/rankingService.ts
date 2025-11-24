// src/services/rankingService.ts
import { db } from "../db/index";
import { posts } from "../db/schema/posts";
import { postMetrics } from "../db/schema/postMetrics";
import { eq } from "drizzle-orm";

// Configurable weights (tweak later)
const WEIGHTS = {
  likes: 3,
  comments: 5,
  saves: 8,
  views: 1,
  hashtagMatchBoost: 1.5,    // multiply score if hashtag matches user's interest
  locationBoost: 1.2,        // multiply if same city/region
};

// recency decay: newer posts get boost. Half-life in hours.
const HALF_LIFE_HOURS = 72;

function recencyBoost(createdAt: string | Date) {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const ageHours = (Date.now() - created.getTime()) / (1000 * 60 * 60);
  // exponential decay: boost = 2^(-age / half_life)
  return Math.pow(2, -ageHours / HALF_LIFE_HOURS);
}

export async function fetchCandidates(limit = 200) {
  // Fetch more candidates than we need to let ranking filter & reorder.
  // Join posts with metrics (left join metrics if missing)
  const rows = await db
    .select({
      post: posts,
      metrics: postMetrics,
    })
    .from(posts)
    .leftJoin(postMetrics, eq(postMetrics.postId, posts.id))
    .where(eq(posts.status, "APPROVED"))
    .orderBy(posts.createdAt) // minimal ordering, we'll score in-memory
    .limit(limit);

  return rows.map(r => ({
    ...r.post,
    metrics: r.metrics || { likes: 0, comments: 0, saves: 0, views: 0 },
  }));
}

/**
 * Compute score for a post given optional user signals (interests, location).
 * - interests: array of hashtags/topics the user likes (lowercased, no #)
 * - userLocation: string (city or region)
 */
export function scorePost(post, { interests = [], userLocation = null } = {}) {
  const m = post.metrics || { likes: 0, comments: 0, saves: 0, views: 0 };

  // base engagement score
  let score =
    (m.likes || 0) * WEIGHTS.likes +
    (m.comments || 0) * WEIGHTS.comments +
    (m.saves || 0) * WEIGHTS.saves +
    (m.views || 0) * WEIGHTS.views;

  // recency multiplier
  const recency = recencyBoost(post.createdAt);
  score = score * (1 + recency); // older posts are decayed, newer boosted

  // hashtag match boost
  if (Array.isArray(post.hashtags) && post.hashtags.length && interests.length) {
    const lowerPostTags = post.hashtags.map(t => t.replace(/^#/, "").toLowerCase());
    const match = lowerPostTags.some(t => interests.includes(t));
    if (match) score *= WEIGHTS.hashtagMatchBoost;
  }

  // location boost (simple contains)
  if (userLocation && post.location) {
    if (post.location.toLowerCase().includes(userLocation.toLowerCase())) {
      score *= WEIGHTS.locationBoost;
    }
  }

  // small tie-breaker: newer posts get slight bump
  const freshness = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60);
  const tieBreaker = 1 / (1 + freshness / 60); // within first hour: ~1, then decays
  score = score * (1 + tieBreaker * 0.01);

  return score;
}
