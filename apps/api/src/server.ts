import express from "express";
import cors from "cors";
import { Logger } from "@spreetail/shared";
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

api.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

app.use("/api", api);

app.listen(port, () => {
  Logger.info(`API server running on port ${port}`);
});
export default app;
