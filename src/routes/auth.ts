// src/routes/auth.ts
import express from "express";
import { verifyFirebaseIdToken } from "../auth/firebase";
import { db, users, auth_providers, refresh_tokens } from "../db";
import { eq,and } from "drizzle-orm";
import { signAccessToken, signRefreshToken, hashToken, getRefreshTokenExpiryDate, verifyRefreshToken } from "../auth/token";

const router = express.Router();

/**
 * POST /auth/firebase
 * Body: { idToken } - firebase ID token (from client SDK)
 */
router.post("/firebase", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "idToken required" });

    const decoded = await verifyFirebaseIdToken(idToken);
    const firebaseUid = decoded.uid;
    const name = decoded.name || null;
    const avatar = decoded.picture || null;
    const defaultUsername = (decoded.email ? decoded.email.split("@")[0] : `u_${firebaseUid.substring(0,8)}`);

    // find existing auth_provider record
    const existing = await db.select().from(auth_providers)
  .where(
    and(
      eq(auth_providers.provider, "firebase"),
      eq(auth_providers.provider_id, firebaseUid)
    )
  )
  .limit(1)
  .execute();

    let userRecord: any;

    if (existing.length) {
      // fetch user
      const u = await db.select().from(users).where(eq(users.id, Number(existing[0].user_id))).limit(1).execute();
      userRecord = u[0];
    } else {
      // create user (ensure username unique)
      let username = defaultUsername.replace(/[^a-z0-9._\-]/gi, "").toLowerCase().slice(0, 40);
      const collision = await db.select().from(users).where(eq(users.username, username)).limit(1).execute();
      if (collision.length) username = `${username}_${firebaseUid.substring(0,6)}`;

      const [createdUser] = await db.insert(users).values({
        name,
        username,
        avatar_url: avatar
      }).returning().execute();

      await db.insert(auth_providers).values({
        user_id: createdUser.id,
        provider: "firebase",
        provider_id: firebaseUid
      }).execute();

      userRecord = createdUser;
    }

    // create tokens
    const accessToken = signAccessToken({ sub: userRecord.id, username: userRecord.username });
    const refreshToken = signRefreshToken({ sub: userRecord.id });

    // store hashed refresh token
    const hashed = hashToken(refreshToken);
    const expiresAt = getRefreshTokenExpiryDate();

    await db.insert(refresh_tokens).values({
      user_id: userRecord.id,
      token_hash: hashed,
      expires_at: expiresAt
    }).execute();

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: userRecord.id,
        name: userRecord.name,
        username: userRecord.username,
        avatar_url: userRecord.avatar_url
      }
    });
  } catch (err: any) {
    console.error("auth/firebase error:", err);
    return res.status(500).json({ error: err.message || "Authentication failed" });
  }
});

/**
 * POST /auth/refresh
 * Body: { refreshToken }
 * Rotation: revoke old token and issue a new refresh token
 */
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });

    // verify signature
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (e) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    const userId = Number(decoded.sub);

    // find token in DB
    const hashed = hashToken(refreshToken);
    const rows = await db.select().from(refresh_tokens).where(eq(refresh_tokens.token_hash, hashed)).limit(1).execute();
    if (!rows.length) return res.status(401).json({ error: "Refresh token not found" });
    const r = rows[0];

    if (r.revoked) return res.status(401).json({ error: "Refresh token revoked" });
    if (new Date(r.expires_at) < new Date()) return res.status(401).json({ error: "Refresh token expired" });

    // rotate: revoke old
    await db.update(refresh_tokens).set({ revoked: true }).where(eq(refresh_tokens.id, r.id)).execute();

    // issue new refresh token + access token
    const newRefreshToken = signRefreshToken({ sub: userId });
    const newHashed = hashToken(newRefreshToken);
    const expiresAt = getRefreshTokenExpiryDate();

    await db.insert(refresh_tokens).values({
      user_id: userId,
      token_hash: newHashed,
      expires_at: expiresAt
    }).execute();

    const newAccessToken = signAccessToken({ sub: userId });

    return res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (err: any) {
    console.error("refresh error", err);
    return res.status(500).json({ error: err.message || "Refresh failed" });
  }
});

/**
 * POST /auth/logout
 * Body: { refreshToken } — revoke this refresh token
 */
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });

    const hashed = hashToken(refreshToken);
    await db.update(refresh_tokens).set({ revoked: true }).where(eq(refresh_tokens.token_hash, hashed)).execute();
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("logout error:", err);
    return res.status(500).json({ error: err.message || "Logout failed" });
  }
});

export default router;
