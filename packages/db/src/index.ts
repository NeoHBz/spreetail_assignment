import { PrismaClient } from "@prisma/client";
import prismaClient, { pool } from "../client";

export const prisma = prismaClient;
export { pool };

export * from "@prisma/client";
