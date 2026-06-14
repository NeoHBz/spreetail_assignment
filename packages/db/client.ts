import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;
const nodeEnv = process.env.NODE_ENV || "development";

let pool: pg.Pool | undefined;
let prismaClient: PrismaClient;

if (nodeEnv === "test") {
  const mockFunc = () => Promise.resolve(null);
  const mockFindMany = () => Promise.resolve([]);
  const mockModel = {
    findUnique: mockFunc,
    findFirst: mockFunc,
    findMany: mockFindMany,
    create: mockFunc,
    update: mockFunc,
    upsert: mockFunc,
    delete: mockFunc,
    count: () => Promise.resolve(0),
  };

  prismaClient = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "$transaction") {
          return (cb: (tx: PrismaClient) => Promise<unknown>) => cb({} as PrismaClient);
        }
        return { ...mockModel };
      },
    }
  ) as unknown as PrismaClient;
} else {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not defined");
  }
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
  });

  const adapter = new PrismaPg(pool);
  prismaClient = new PrismaClient({ adapter });
}

const prisma = prismaClient;

export { pool };
export default prisma;
