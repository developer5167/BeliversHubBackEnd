import express from "express";
import { db } from "../db/index";
import { userInterests } from "../db/schema/userInterests";
import { eq } from "drizzle-orm";

const router = express.Router();

router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  const data = await db.query.userInterests.findFirst({
    where: eq(userInterests.userId, userId),
  });

  return res.json({ interests: data?.interests || {} });
});

export default router;
