import { Router, Request, Response } from "express";
import { prisma } from "@spreetail/db";
import { Logger } from "@spreetail/shared";

const router: Router = Router();

const HARDCODED_FALLBACK: Record<string, number> = {
  USD: 1 / 83.00,
  EUR: 1 / 90.00,
  JPY: 1 / 0.55,
  GBP: 1 / 105.00,
  CNY: 1 / 11.50,
  CAD: 1 / 61.00,
  AUD: 1 / 54.00,
  CHF: 1 / 93.00,
  HKD: 1 / 10.60,
  SGD: 1 / 62.00,
};

// GET /fx-rates — returns today's INR-based exchange rates, fetched once per day
router.get("/", async (_req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateStr = today.toISOString().slice(0, 10);

  try {
    const existing = await prisma.exchangeRate.findFirst({
      where: { fromCurrency: "INR", effectiveDate: today },
    });

    if (existing) {
      const all = await prisma.exchangeRate.findMany({
        where: { fromCurrency: "INR", effectiveDate: today },
      });
      const rates: Record<string, number> = {};
      all.forEach((r) => { rates[r.toCurrency] = Number(r.rate); });
      return res.json({ rates, source: "cache", date: dateStr });
    }

    try {
      const apiRes = await fetch("https://open.er-api.com/v6/latest/INR");
      if (!apiRes.ok) throw new Error(`FX API HTTP ${apiRes.status}`);
      const apiData = await apiRes.json();
      if (apiData.result !== "success") throw new Error(`FX API: ${apiData.result}`);

      const { rates } = apiData as { rates: Record<string, number> };

      const records = Object.entries(rates).map(([toCurrency, rate]) => ({
        fromCurrency: "INR",
        toCurrency,
        rate,
        effectiveDate: today,
        source: "open.er-api.com",
      }));

      await prisma.exchangeRate.createMany({ data: records, skipDuplicates: true });
      Logger.info(`Fetched and cached ${records.length} FX rates for ${dateStr}`);
      return res.json({ rates, source: "live", date: dateStr });
    } catch (fetchErr: any) {
      Logger.warn(`FX live fetch failed (${fetchErr.message}), trying most recent DB rates`);

      // Fallback 1: most recent rates in DB
      const recent = await prisma.exchangeRate.findMany({
        where: { fromCurrency: "INR" },
        orderBy: { effectiveDate: "desc" },
        take: 100,
      });

      if (recent.length > 0) {
        const rates: Record<string, number> = {};
        recent.forEach((r) => { if (!(r.toCurrency in rates)) rates[r.toCurrency] = Number(r.rate); });
        return res.json({ rates, source: "stale_cache", date: dateStr });
      }

      // Fallback 2: hardcoded defaults
      Logger.warn("No DB rates found, using hardcoded fallback rates");
      return res.json({ rates: HARDCODED_FALLBACK, source: "hardcoded_fallback", date: dateStr });
    }
  } catch (err: any) {
    Logger.error(`FX rates endpoint error: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
