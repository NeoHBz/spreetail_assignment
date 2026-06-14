import { Router, Response } from "express";
import { prisma } from "@spreetail/db";
import { Logger } from "@spreetail/shared";
import { AuthRequest, isAuthenticated } from "../middleware/auth";

const router: Router = Router();


// List settlements for a group
router.get("/group/:groupId", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    const settlements = await prisma.settlement.findMany({
      where: { groupId: req.params.groupId },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    });
    res.json(settlements);
  } catch (error) {
    Logger.error("Failed to list settlements", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list settlements" } });
  }
});

// Record a settlement
router.post("/", isAuthenticated, async (req: AuthRequest, res: Response) => {
  const { groupId, fromUserId, toUserId, amount, currency, date, notes } = req.body;
  if (!groupId || !fromUserId || !toUserId || !amount || !currency || !date) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Missing required parameters" } });
  }

  try {
    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        fromUserId,
        toUserId,
        amount,
        currency,
        date: new Date(date),
        notes,
      },
    });
    res.status(201).json(settlement);
  } catch (error) {
    Logger.error("Failed to create settlement", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to record settlement" } });
  }
});

// Delete settlement
router.delete("/:id", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.settlement.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    Logger.error("Failed to delete settlement", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete settlement" } });
  }
});

export default router;
