import { PrismaClient } from "@prisma/client";
import prismaClient, { pool } from "../prisma.config";

export const prisma = prismaClient;
export { pool };

export * from "@prisma/client";
