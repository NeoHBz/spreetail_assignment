import { Router, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "@spreetail/db";
import { Logger } from "@spreetail/shared";
import { AuthRequest, isAuthenticated } from "../middleware/auth";

const router: Router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Name, email, and password are required" } });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: { code: "CONFLICT", message: "User with this email already exists" } });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
    });

    Logger.info(`New user registered: ${user.email}`);
    res.status(201).json({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    Logger.error("Error registering user", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Email and password are required" } });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    Logger.error("Error logging in user", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  }
});

router.get("/me", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  }
});

export default router;
