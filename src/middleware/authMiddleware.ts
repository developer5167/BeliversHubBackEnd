// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../auth/token";

export interface AuthRequest extends Request {
  user?: { id: number; username?: string };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Missing Authorization header" });
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return res.status(401).json({ error: "Invalid Authorization header" });

  try {
    const decoded = verifyAccessToken(parts[1]);
    req.user = { id: Number((decoded as any).sub), username: (decoded as any).username };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
