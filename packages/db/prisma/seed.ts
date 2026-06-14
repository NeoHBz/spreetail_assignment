import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create users
  const passwordHash = await bcrypt.hash("password123", 10);

  const usersData = [
    { name: "Aisha", email: "aisha@example.com" },
    { name: "Rohan", email: "rohan@example.com" },
    { name: "Priya", email: "priya@example.com" },
    { name: "Meera", email: "meera@example.com" },
    { name: "Dev", email: "dev@example.com" },
    { name: "Sam", email: "sam@example.com" },
  ];

  const users: Record<string, any> = {};

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        passwordHash,
      },
    });
    users[u.name] = user;
    console.log(`User created/found: ${user.name}`);
  }

  // Create group
  const group = await prisma.group.create({
    data: {
      name: "The Flat",
    },
  });
  console.log(`Group created: ${group.name} (${group.id})`);

  // Create memberships
  // Aisha, Rohan, Priya, Meera joined Feb 1, 2026
  // Meera left March 31, 2026
  // Sam joined April 10, 2026
  // Dev has no membership (visitor)
  const memberships = [
    { userId: users["Aisha"].id, joinedAt: new Date("2026-02-01T00:00:00Z"), leftAt: null },
    { userId: users["Rohan"].id, joinedAt: new Date("2026-02-01T00:00:00Z"), leftAt: null },
    { userId: users["Priya"].id, joinedAt: new Date("2026-02-01T00:00:00Z"), leftAt: null },
    { userId: users["Meera"].id, joinedAt: new Date("2026-02-01T00:00:00Z"), leftAt: new Date("2026-03-31T23:59:59Z") },
    { userId: users["Sam"].id, joinedAt: new Date("2026-04-10T00:00:00Z"), leftAt: null },
  ];

  for (const m of memberships) {
    await prisma.groupMembership.create({
      data: {
        userId: m.userId,
        groupId: group.id,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
      },
    });
  }
  console.log("Group memberships seeded successfully.");

  // Seed standard exchange rate (USD to INR is ~83.0)
  // Let's seed exchange rate for USD to INR
  await prisma.exchangeRate.create({
    data: {
      fromCurrency: "USD",
      toCurrency: "INR",
      rate: 83.00,
      effectiveDate: new Date("2026-03-01T00:00:00Z"),
      source: "Manual Seed - Historical trip rate",
    },
  });
  console.log("Exchange rate USD -> INR seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
