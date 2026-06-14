import { expect, test, describe } from "bun:test";
import { splitEqual, splitUnequal, splitPercentage, splitShare } from "./split_utils";

describe("Split Calculations", () => {
  test("Equal split handles rounding residues on first member", () => {
    const members = [{ userId: "1" }, { userId: "2" }, { userId: "3" }];
    const res = splitEqual(10, members);
    expect(res[0].owedAmount).toBe(3.34);
    expect(res[1].owedAmount).toBe(3.33);
    expect(res[2].owedAmount).toBe(3.33);
    expect(res.reduce((s, r) => s + r.owedAmount, 0)).toBe(10);
  });

  test("Unequal splits validate correct sum", () => {
    const splits = [
      { userId: "1", amount: 4 },
      { userId: "2", amount: 6 },
    ];
    const res = splitUnequal(10, splits);
    expect(res[0].owedAmount).toBe(4);
    expect(res[1].owedAmount).toBe(6);

    expect(() => splitUnequal(11, splits)).toThrow();
  });

  test("Percentage splits validate sum is 100% and calculates accurately", () => {
    const splits = [
      { userId: "1", percentage: 33.33 },
      { userId: "2", percentage: 33.33 },
      { userId: "3", percentage: 33.34 },
    ];
    const res = splitPercentage(100, splits);
    expect(res.reduce((s, r) => s + r.owedAmount, 0)).toBe(100);

    expect(() => splitPercentage(100, [{ userId: "1", percentage: 90 }])).toThrow();
  });

  test("Share weights split calculates proportionally", () => {
    const splits = [
      { userId: "1", weight: 1 },
      { userId: "2", weight: 2 },
    ];
    const res = splitShare(120, splits);
    expect(res[0].owedAmount).toBe(40);
    expect(res[1].owedAmount).toBe(80);
  });
});
