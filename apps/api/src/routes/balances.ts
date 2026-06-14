import { Router, Response } from "express";
import { prisma } from "@spreetail/db";
import { Logger } from "@spreetail/shared";
import { AuthRequest, isAuthenticated } from "../middleware/auth";

const router: Router = Router();


// Minimize Transactions (Greedy algorithm)
export function minimizeDebts(balances: Record<string, { name: string; amount: number }>) {
  const debts = Object.entries(balances)
    .map(([id, { name, amount }]) => ({ id, name, amount: Math.round(amount * 100) / 100 }))
    .filter((d) => Math.abs(d.amount) > 0.01);

  const creditors = debts.filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount); // owe him
  const debtors = debts.filter((d) => d.amount < 0).sort((a, b) => a.amount - b.amount); // owes others

  const transactions: { fromUserId: string; fromUserName: string; toUserId: string; toUserName: string; amount: number }[] = [];

  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const oweAmount = Math.min(-debtor.amount, creditor.amount);
    if (oweAmount > 0.01) {
      transactions.push({
        fromUserId: debtor.id,
        fromUserName: debtor.name,
        toUserId: creditor.id,
        toUserName: creditor.name,
        amount: Math.round(oweAmount * 100) / 100,
      });
    }

    debtor.amount += oweAmount;
    creditor.amount -= oweAmount;

    if (Math.abs(debtor.amount) < 0.01) i++;
    if (Math.abs(creditor.amount) < 0.01) j++;
  }

  return transactions;
}

// Get Net Balances and suggestions
router.get("/group/:groupId", isAuthenticated, async (req: AuthRequest, res: Response) => {
  const { asOfDate } = req.query;

  try {
    const filterDate = asOfDate ? new Date(asOfDate as string) : new Date();

    // Fetch members
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId: req.params.groupId },
      include: { user: { select: { id: true, name: true } } },
    });

    const membersMap: Record<string, { name: string; amount: number }> = {};
    for (const m of memberships) {
      membersMap[m.userId] = { name: m.user.name, amount: 0 };
    }

    // Fetch expenses up to filterDate
    const expenses = await prisma.expense.findMany({
      where: {
        groupId: req.params.groupId,
        date: { lte: filterDate },
        deletedAt: null,
      },
      include: {
        splits: true,
        paidBy: { select: { id: true, name: true } },
      },
    });

    // Ensure non-member payers (e.g. Dev) appear in the map so their credits aren't dropped
    for (const e of expenses) {
      if (!membersMap[e.paidByUserId]) {
        membersMap[e.paidByUserId] = { name: e.paidBy.name, amount: 0 };
      }
    }

    // Add paid amounts and subtract split shares
    for (const e of expenses) {
      // Add paid amount (only if payer is still in membersMap, which all canonical users are)
      if (membersMap[e.paidByUserId]) {
        membersMap[e.paidByUserId].amount += Number(e.convertedAmountInr);
      }
      
      // Subtract splits (excluding guests)
      for (const s of e.splits) {
        if (s.userId && membersMap[s.userId]) {
          membersMap[s.userId].amount -= Number(s.owedAmount);
        }
      }
    }

    // Fetch settlements
    const settlements = await prisma.settlement.findMany({
      where: {
        groupId: req.params.groupId,
        date: { lte: filterDate },
      },
    });

    for (const s of settlements) {
      let settlementAmountInr = Number(s.amount);
      if (s.currency.toUpperCase() === "USD") {
        const rateObj = await prisma.exchangeRate.findFirst({
          where: { fromCurrency: "USD", toCurrency: "INR" },
          orderBy: { effectiveDate: "desc" },
        });
        const rate = rateObj ? Number(rateObj.rate) : 83.00;
        settlementAmountInr = Number(s.amount) * rate;
      }

      if (membersMap[s.fromUserId]) {
        membersMap[s.fromUserId].amount += settlementAmountInr; // fromUser paid, so they owe less
      }
      if (membersMap[s.toUserId]) {
        membersMap[s.toUserId].amount -= settlementAmountInr; // toUser received, so they are owed less
      }
    }

    // Round balances to 2 decimal places
    for (const id of Object.keys(membersMap)) {
      membersMap[id].amount = Math.round(membersMap[id].amount * 100) / 100;
    }

    // Generate minimization suggestions
    const suggestions = minimizeDebts(JSON.parse(JSON.stringify(membersMap)));

    res.json({
      balances: Object.entries(membersMap).map(([id, m]) => ({ userId: id, name: m.name, netBalance: m.amount })),
      suggestions,
    });
  } catch (error) {
    Logger.error("Failed to compute balances", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to compute balances" } });
  }
});

// Get detailed breakdown for a user (Rohan's Drilldown)
router.get("/group/:groupId/user/:userId", isAuthenticated, async (req: AuthRequest, res: Response) => {
  const { asOfDate } = req.query;

  try {
    const filterDate = asOfDate ? new Date(asOfDate as string) : new Date();

    // 1. Get expenses where user paid
    const paidExpenses = await prisma.expense.findMany({
      where: {
        groupId: req.params.groupId,
        paidByUserId: req.params.userId,
        date: { lte: filterDate },
        deletedAt: null,
      },
      select: {
        id: true,
        description: true,
        date: true,
        convertedAmountInr: true,
        amountOriginalCurrency: true,
        amountOriginal: true,
      },
    });

    // 2. Get splits where user owes money
    const owedSplits = await prisma.expenseSplit.findMany({
      where: {
        userId: req.params.userId,
        expense: {
          groupId: req.params.groupId,
          date: { lte: filterDate },
          deletedAt: null,
        },
      },
      include: {
        expense: {
          select: {
            id: true,
            description: true,
            date: true,
            convertedAmountInr: true,
            amountOriginalCurrency: true,
            amountOriginal: true,
            paidBy: { select: { name: true } },
          },
        },
      },
    });

    // 3. Get settlements sent by user
    const sentSettlements = await prisma.settlement.findMany({
      where: {
        groupId: req.params.groupId,
        fromUserId: req.params.userId,
        date: { lte: filterDate },
      },
      include: {
        toUser: { select: { name: true } },
      },
    });

    // 4. Get settlements received by user
    const receivedSettlements = await prisma.settlement.findMany({
      where: {
        groupId: req.params.groupId,
        toUserId: req.params.userId,
        date: { lte: filterDate },
      },
      include: {
        fromUser: { select: { name: true } },
      },
    });

    res.json({
      paidExpenses,
      owedSplits: owedSplits.map((s) => ({
        id: s.id,
        owedAmount: s.owedAmount,
        expense: s.expense,
      })),
      sentSettlements,
      receivedSettlements,
    });
  } catch (error) {
    Logger.error("Failed to fetch user breakdown", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch user breakdown" } });
  }
});

export default router;
