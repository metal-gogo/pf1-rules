import { fileURLToPath } from "node:url";
import path from "node:path";

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const defaultDatabasePath = path.join(
  projectRoot,
  "data",
  "database",
  "pf1_spells.db",
);

export function databasePath(): string {
  const configured = process.env.PF1_DATABASE_PATH;
  return configured ? path.resolve(configured) : defaultDatabasePath;
}

export function sqliteDatabaseUrl(filename = databasePath()): string {
  return `file:${filename.replaceAll("\\", "/")}`;
}
