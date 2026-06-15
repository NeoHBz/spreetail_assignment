import express from "express";
import cors from "cors";
import { Logger } from "@spreetail/shared";
import { prisma } from "@spreetail/db";
import authRouter from "./routes/auth";
import groupsRouter from "./routes/groups";
import expensesRouter from "./routes/expenses";
import settlementsRouter from "./routes/settlements";
import balancesRouter from "./routes/balances";
import importRouter from "./routes/import";
import fxRouter from "./routes/fx";

const app: express.Application = express();

const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes are mounted under /api so the prefix is consistent end-to-end:
// browser -> reverse proxy (NPM) / Vite dev proxy -> API, with no rewriting.
const api: express.Router = express.Router();
api.use("/auth", authRouter);
api.use("/groups", groupsRouter);
api.use("/expenses", expensesRouter);
api.use("/settlements", settlementsRouter);
api.use("/balances", balancesRouter);
api.use("/import", importRouter);
api.use("/fx-rates", fxRouter);

api.get("/health", async (req, res) => {
  let dbStatus: "connected" | "error" = "error";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }
  res.json({ status: "healthy", db: dbStatus, datetime: new Date().toISOString() });
});

app.use("/api", api);

app.listen(port, async () => {
  Logger.info(`API server running on port ${port}`);
  try {
    await prisma.$connect();
    Logger.info("Database connected successfully");
  } catch (err) {
    Logger.error("Database connection failed", err);
  }
});
export default app;
