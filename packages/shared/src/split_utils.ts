export interface SplitResult {
  userId?: string;
  guestId?: string;
  owedAmount: number; // Rounded to 2 decimal places (sub-paisa precision resolution)
}

/**
 * Split an amount equally among a list of members (users or guests).
 * Rounding residues are added to the first member's share.
 */
export function splitEqual(amount: number, members: { userId?: string; guestId?: string }[]): SplitResult[] {
  if (members.length === 0) return [];
  const exactShare = amount / members.length;
  const roundedShare = Math.round(exactShare * 100) / 100;
  
  const results: SplitResult[] = members.map((m) => ({
    ...m,
    owedAmount: roundedShare,
  }));

  // Correct rounding errors by placing remainder on the first member
  const totalRounded = results.reduce((sum, r) => sum + r.owedAmount, 0);
  const diff = Math.round((amount - totalRounded) * 100) / 100;
  if (diff !== 0 && results.length > 0) {
    results[0].owedAmount = Math.round((results[0].owedAmount + diff) * 100) / 100;
  }

  return results;
}

/**
 * Validate and compute unequal splits.
 * Validates that the sum of splits matches the total amount.
 */
export function splitUnequal(amount: number, splits: { userId?: string; guestId?: string; amount: number }[]): SplitResult[] {
  const sum = splits.reduce((s, x) => s + x.amount, 0);
  if (Math.abs(sum - amount) > 0.01) {
    throw new Error(`Sum of splits (${sum}) does not equal total amount (${amount})`);
  }
  return splits.map((s) => ({
    userId: s.userId,
    guestId: s.guestId,
    owedAmount: Math.round(s.amount * 100) / 100,
  }));
}

/**
 * Validate percentage splits and compute owed amounts.
 * Validates that the sum of percentages is exactly 100%.
 */
export function splitPercentage(amount: number, splits: { userId?: string; guestId?: string; percentage: number }[]): SplitResult[] {
  const sumPct = splits.reduce((s, x) => s + x.percentage, 0);
  if (Math.abs(sumPct - 100) > 0.01) {
    throw new Error(`Sum of percentages (${sumPct}%) does not equal 100%`);
  }

  const results: SplitResult[] = splits.map((s) => ({
    userId: s.userId,
    guestId: s.guestId,
    owedAmount: Math.round(((amount * s.percentage) / 100) * 100) / 100,
  }));

  // Handle rounding residues
  const totalRounded = results.reduce((sum, r) => sum + r.owedAmount, 0);
  const diff = Math.round((amount - totalRounded) * 100) / 100;
  if (diff !== 0 && results.length > 0) {
    results[0].owedAmount = Math.round((results[0].owedAmount + diff) * 100) / 100;
  }

  return results;
}

/**
 * Compute split shares proportionally based on weights.
 */
export function splitShare(amount: number, splits: { userId?: string; guestId?: string; weight: number }[]): SplitResult[] {
  const totalWeight = splits.reduce((s, x) => s + x.weight, 0);
  if (totalWeight <= 0) {
    throw new Error("Total weight must be greater than zero");
  }

  const results: SplitResult[] = splits.map((s) => ({
    userId: s.userId,
    guestId: s.guestId,
    owedAmount: Math.round(((amount * s.weight) / totalWeight) * 100) / 100,
  }));

  // Handle rounding residues
  const totalRounded = results.reduce((sum, r) => sum + r.owedAmount, 0);
  const diff = Math.round((amount - totalRounded) * 100) / 100;
  if (diff !== 0 && results.length > 0) {
    results[0].owedAmount = Math.round((results[0].owedAmount + diff) * 100) / 100;
  }

  return results;
}
