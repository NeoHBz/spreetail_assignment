import { expect, test, describe } from "bun:test";
import { minimizeDebts } from "./balances";

describe("Debt Minimization Algorithm", () => {
  test("Simplifies direct debts", () => {
    const balances = {
      "1": { name: "Aisha", amount: 100 },
      "2": { name: "Rohan", amount: -100 },
    };
    const tx = minimizeDebts(balances);
    expect(tx).toHaveLength(1);
    expect(tx[0].fromUserName).toBe("Rohan");
    expect(tx[0].toUserName).toBe("Aisha");
    expect(tx[0].amount).toBe(100);
  });

  test("Minimizes multiple debts optimally", () => {
    const balances = {
      "1": { name: "Aisha", amount: 100 },
      "2": { name: "Rohan", amount: -50 },
      "3": { name: "Priya", amount: -50 },
    };
    const tx = minimizeDebts(balances);
    expect(tx).toHaveLength(2);
    expect(tx.reduce((s, t) => s + t.amount, 0)).toBe(100);
  });
});
