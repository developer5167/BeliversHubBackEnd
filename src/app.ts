// src/index.ts
import express from "express";
import dotenv from "dotenv";
dotenv.config();


import authRoutes from "./routes/auth";
import statusRoutes from "./routes/status";
import discardRoutes from "./routes/discard";
import postsRouter from "./routes/posts";
import router from "./routes/upload";
import { requireAuth, AuthRequest } from "./middleware/authMiddleware";
import adminModerationRouter from "./routes/adminModeration";
import feedRouter from "./routes/feed";
import reelsRouter from "./routes/reels";
const app = express();
app.use(express.json({ limit: "20mb" }  ));
app.use("/auth", authRoutes);
app.use("/api/posts", router);
app.use("/api/posts", statusRoutes);
app.use("/api/posts", discardRoutes);
app.use("/posts", postsRouter);
app.use("/admin", adminModerationRouter);
app.use("/feed", feedRouter);
app.use("/reels", reelsRouter);




app.get("/me", requireAuth, async (req: AuthRequest, res) => {
  return res.json({ id: req.user?.id, username: req.user?.username });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server listening on ${port}`));
