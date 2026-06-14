import { Router, Response } from "express";
import { prisma } from "@spreetail/db";
import { Logger, splitEqual, splitUnequal, splitPercentage, splitShare } from "@spreetail/shared";
import { AuthRequest, isAuthenticated } from "../middleware/auth";

const router: Router = Router();


// Get list of active expenses for a group
router.get("/group/:groupId", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    const expenses = await prisma.expense.findMany({
      where: {
        groupId: req.params.groupId,
        deletedAt: null,
      },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true } },
            guest: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: "desc" },
    });

    res.json(expenses);
  } catch (error) {
    Logger.error("Failed to list expenses", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list expenses" } });
  }
});

// Helper: validate memberships and guests
async function validateSplitsAndCalculate(
  amount: number,
  currency: string,
  date: Date,
  groupId: string,
  splitType: string,
  splitsInput: any[]
) {
  // Find members and guests
  const memberships = await prisma.groupMembership.findMany({ where: { groupId } });
  
  // Validate that users in splits are members active at the given date
  const activeUserIds = new Set(
    memberships
      .filter((m) => {
        const joined = new Date(m.joinedAt);
        const left = m.leftAt ? new Date(m.leftAt) : null;
        return date >= joined && (!left || date <= left);
      })
      .map((m) => m.userId)
  );

  // Load guests
  const guests = await prisma.guest.findMany({
    where: { id: { in: splitsInput.filter((s) => s.guestId).map((s) => s.guestId) } },
  });
  const guestIds = new Set(guests.map((g) => g.id));

  // Verify inputs
  for (const s of splitsInput) {
    if (s.userId && !activeUserIds.has(s.userId)) {
      throw new Error(`User ${s.userId} is not active in this group on this date`);
    }
    if (s.guestId && !guestIds.has(s.guestId)) {
      throw new Error(`Guest ${s.guestId} not found`);
    }
  }

  // Calculate splits
  let computedSplits: any[] = [];
  if (splitType === "equal") {
    computedSplits = splitEqual(amount, splitsInput.map((s) => ({ userId: s.userId, guestId: s.guestId })));
  } else if (splitType === "unequal") {
    computedSplits = splitUnequal(amount, splitsInput);
  } else if (splitType === "percentage") {
    computedSplits = splitPercentage(amount, splitsInput);
  } else if (splitType === "share") {
    computedSplits = splitShare(amount, splitsInput);
  } else {
    throw new Error(`Invalid split type: ${splitType}`);
  }

  return computedSplits;
}

// Create expense
router.post("/", isAuthenticated, async (req: AuthRequest, res: Response) => {
  const { groupId, paidByUserId, description, amountOriginal, amountOriginalCurrency, date, splitType, splits, notes } = req.body;

  if (!groupId || !paidByUserId || !description || !amountOriginal || !amountOriginalCurrency || !date || !splitType || !splits) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Missing required parameters" } });
  }

  try {
    const expenseDate = new Date(date);
    
    // Check if payer was a member on that date
    const membership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: paidByUserId, groupId } },
    });
    if (!membership) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Payer is not a member of the group" } });
    }

    const joined = new Date(membership.joinedAt);
    const left = membership.leftAt ? new Date(membership.leftAt) : null;
    if (expenseDate < joined || (left && expenseDate > left)) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Payer was not an active member on the expense date" } });
    }

    // Convert amount to INR
    let convertedAmountInr = Number(amountOriginal);
    if (amountOriginalCurrency.toUpperCase() === "USD") {
      // Lookup exchange rate close to date or fallback to seeded value
      const rateObj = await prisma.exchangeRate.findFirst({
        where: { fromCurrency: "USD", toCurrency: "INR" },
        orderBy: { effectiveDate: "desc" },
      });
      const rate = rateObj ? Number(rateObj.rate) : 83.00;
      convertedAmountInr = Number(amountOriginal) * rate;
    } else if (amountOriginalCurrency.toUpperCase() !== "INR") {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Unsupported currency" } });
    }

    // Calculate splits
    const calculatedSplits = await validateSplitsAndCalculate(
      Number(amountOriginal),
      amountOriginalCurrency,
      expenseDate,
      groupId,
      splitType,
      splits
    );

    // Create inside a Transaction
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          groupId,
          paidByUserId,
          description,
          amountOriginal,
          amountOriginalCurrency,
          convertedAmountInr,
          date: expenseDate,
          splitType,
          notes,
          source: "manual",
        },
      });

      // Insert splits
      const splitPromises = calculatedSplits.map((cs) => {
        // Compute INR equivalent share
        const ratio = Number(amountOriginal) > 0 ? cs.owedAmount / Number(amountOriginal) : 0;
        const owedAmountInr = convertedAmountInr * ratio;

        return tx.expenseSplit.create({
          data: {
            expenseId: created.id,
            userId: cs.userId || null,
            guestId: cs.guestId || null,
            // Store the converted INR share in db
            owedAmount: owedAmountInr,
          },
        });
      });

      await Promise.all(splitPromises);
      return created;
    });

    res.status(201).json(expense);
  } catch (error: any) {
    Logger.error("Failed to create expense", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: error.message || "Failed to create expense" } });
  }
});

// Soft delete expense
router.delete("/:expenseId", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    const expense = await prisma.expense.update({
      where: { id: req.params.expenseId },
      data: { deletedAt: new Date() },
    });
    res.json({ success: true, expense });
  } catch (error) {
    Logger.error("Failed to delete expense", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete expense" } });
  }
});

export default router;
