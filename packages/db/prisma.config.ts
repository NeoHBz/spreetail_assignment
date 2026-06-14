import { defineConfig, env } from "prisma/config";
import fs from "fs";
import path from "path";

try {
  const envPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    for (const line of envConfig.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...values] = trimmed.split("=");
        if (key) {
          const val = values.join("=").replace(/^["']|["']$/g, ""); // strip quotes
          process.env[key.trim()] = val;
        }
      }
    }
  }
} catch (e) {
  // Ignore
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
