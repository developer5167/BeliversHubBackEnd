// src/auth/token.ts
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const accessSecret = process.env.ACCESS_TOKEN_SECRET!;
const refreshSecret = process.env.REFRESH_TOKEN_SECRET!;
const accessExp = process.env.ACCESS_TOKEN_EXP || "15m";
const refreshExpDays = Number(process.env.REFRESH_TOKEN_EXP_DAYS || 30);

export function signAccessToken(payload: object) {
  return jwt.sign(payload, accessSecret, { expiresIn: accessExp });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, accessSecret) as any;
}

export function signRefreshToken(payload: object) {
  // sign refresh token with different secret and longer expiry
  return jwt.sign(payload, refreshSecret, { expiresIn: `${refreshExpDays}d` });
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, refreshSecret) as any;
}

// store only hash in DB
export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getRefreshTokenExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + refreshExpDays);
  return d;
}
