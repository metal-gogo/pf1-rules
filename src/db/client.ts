import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { sqliteDatabaseUrl } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";


export function createLocalPrisma(databaseUrl = sqliteDatabaseUrl()): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
}
