import { defineConfig } from "prisma/config";
import dotenv from "dotenv";
import path from "path";

const envPath = path.join(__dirname, "../../.env");
dotenv.config({ path: envPath });

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
