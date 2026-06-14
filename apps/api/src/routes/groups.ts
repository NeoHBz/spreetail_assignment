import { Router, Response } from "express";
import { prisma } from "@spreetail/db";
import { Logger } from "@spreetail/shared";
import { AuthRequest, isAuthenticated } from "../middleware/auth";

const router: Router = Router();


// List groups for the current user
router.get("/", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: req.userId },
      include: {
        group: {
          include: {
            memberships: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
    });

    const groups = memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      createdAt: m.group.createdAt,
      members: m.group.memberships.map((mem) => ({
        id: mem.user.id,
        name: mem.user.name,
        email: mem.user.email,
        joinedAt: mem.joinedAt,
        leftAt: mem.leftAt,
      })),
    }));

    res.json(groups);
  } catch (error) {
    Logger.error("Failed to list groups", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list groups" } });
  }
});

// Create a new group
router.post("/", isAuthenticated, async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Group name is required" } });
  }

  try {
    const group = await prisma.group.create({
      data: { name },
    });

    // Automatically join the creator to the group
    await prisma.groupMembership.create({
      data: {
        userId: req.userId!,
        groupId: group.id,
        joinedAt: new Date(),
      },
    });

    res.status(201).json(group);
  } catch (error) {
    Logger.error("Failed to create group", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create group" } });
  }
});

// Get group details
router.get("/:id", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Group not found" } });
    }

    // Check membership
    const isMember = group.memberships.some((m) => m.userId === req.userId);
    if (!isMember) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Not a member of this group" } });
    }

    res.json({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      members: group.memberships.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
      })),
    });
  } catch (error) {
    Logger.error("Failed to get group", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch group details" } });
  }
});

// Add a member to a group
router.post("/:id/members", isAuthenticated, async (req: AuthRequest, res: Response) => {
  const { email, joinedAt } = req.body;
  if (!email || !joinedAt) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Email and joinedAt are required" } });
  }

  try {
    const userToJoin = await prisma.user.findUnique({ where: { email } });
    if (!userToJoin) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }

    const membership = await prisma.groupMembership.upsert({
      where: {
        userId_groupId: {
          userId: userToJoin.id,
          groupId: req.params.id,
        },
      },
      update: {
        joinedAt: new Date(joinedAt),
        leftAt: null, // Clear leftAt if re-joining
      },
      create: {
        userId: userToJoin.id,
        groupId: req.params.id,
        joinedAt: new Date(joinedAt),
      },
    });

    res.json(membership);
  } catch (error) {
    Logger.error("Failed to add member", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to add member" } });
  }
});

// Set leftAt date (member leaves group)
router.patch("/:id/members/:userId", isAuthenticated, async (req: AuthRequest, res: Response) => {
  const { leftAt } = req.body;
  if (!leftAt) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "leftAt date is required" } });
  }

  try {
    const membership = await prisma.groupMembership.update({
      where: {
        userId_groupId: {
          userId: req.params.userId,
          groupId: req.params.id,
        },
      },
      data: {
        leftAt: new Date(leftAt),
      },
    });

    res.json(membership);
  } catch (error) {
    Logger.error("Failed to update membership leftAt", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to mark member as left" } });
  }
});

export default router;
