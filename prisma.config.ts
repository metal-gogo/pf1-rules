import "dotenv/config";

import { defineConfig } from "prisma/config";

import { sqliteDatabaseUrl } from "./src/config.js";


export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? sqliteDatabaseUrl(),
  },
});
