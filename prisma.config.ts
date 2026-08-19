import "dotenv/config";

import path from "node:path";

import { defineConfig } from "prisma/config";


const localDatabaseUrl = `file:${path
  .resolve("data", "database", "pf1_spells.db")
  .replaceAll("\\", "/")}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
