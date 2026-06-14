import express from "express";
import cors from "cors";
import { Logger } from "@spreetail/shared";
import authRouter from "./routes/auth";
import groupsRouter from "./routes/groups";
import expensesRouter from "./routes/expenses";
import settlementsRouter from "./routes/settlements";
import balancesRouter from "./routes/balances";
import importRouter from "./routes/import";

const app: express.Application = express();

const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use("/auth", authRouter);
app.use("/groups", groupsRouter);
app.use("/expenses", expensesRouter);
app.use("/settlements", settlementsRouter);
app.use("/balances", balancesRouter);
app.use("/import", importRouter);

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

app.listen(port, () => {
  Logger.info(`API server running on port ${port}`);
});
export default app;
