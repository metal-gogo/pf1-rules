import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { databasePath, projectRoot, sqliteDatabaseUrl } from "../src/config.js";

afterEach(() => vi.unstubAllEnvs());

it("uses the same configured SQLite file for migrations and runtime", async () => {
  vi.stubEnv("PF1_DATABASE_PATH", "./custom-database/pf1.db");
  vi.stubEnv("DATABASE_URL", undefined);
  const configuration = (await import("../prisma.config.js")).default;
  expect(databasePath()).toBe(path.resolve("./custom-database/pf1.db"));
  expect(configuration.datasource?.url).toBe(sqliteDatabaseUrl());
  expect(projectRoot).toBe(path.resolve("."));
});
