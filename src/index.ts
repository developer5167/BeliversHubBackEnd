// src/index.ts
import express from "express";
import dotenv from "dotenv";
dotenv.config();

import authRoutes from "./routes/auth";
import { requireAuth, AuthRequest } from "./middleware/authMiddleware";

const app = express();
app.use(express.json());

app.use("/auth", authRoutes);

app.get("/me", requireAuth, async (req: AuthRequest, res) => {
  return res.json({ id: req.user?.id, username: req.user?.username });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server listening on ${port}`));
