import { createLocalPrisma } from "./db/client.js";
import {
  checkDatabase,
  databaseStatistics,
  importPackage,
} from "./ingestion/importer.js";
import { validatePackage } from "./ingestion/validate.js";
import {
  findSpell,
  ingestionQueueSummary,
  listIngestionQueue,
  searchRules,
  spellsForList,
} from "./query/spells.js";


function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}


async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command === "validate") {
    print(validatePackage());
    return;
  }

  const prisma = createLocalPrisma();
  try {
    switch (command) {
      case "import":
        print(await importPackage(prisma));
        break;
      case "check":
        await checkDatabase(prisma);
        print({ status: "ok" });
        break;
      case "stats":
        print(await databaseStatistics(prisma));
        break;
      case "spell": {
        const query = args.join(" ");
        if (!query) throw new Error("Usage: pnpm tsx src/cli.ts spell <name-or-id>");
        print(await findSpell(prisma, query));
        break;
      }
      case "search": {
        const query = args.join(" ");
        if (!query) throw new Error("Usage: pnpm tsx src/cli.ts search <text>");
        print(await searchRules(prisma, query));
        break;
      }
      case "list": {
        const [listId, levelText] = args;
        if (!listId) throw new Error("Usage: pnpm tsx src/cli.ts list <spell-list-id> [level]");
        print(await spellsForList(prisma, listId, levelText ? Number(levelText) : undefined));
        break;
      }
      case "ingestion": {
        const [subcommand = "stats", value] = args;
        if (subcommand === "stats") {
          print(await ingestionQueueSummary(prisma));
          break;
        }
        if (subcommand === "batch") {
          const batchNumber = Number(value);
          if (!Number.isInteger(batchNumber) || batchNumber < 1) {
            throw new Error("Usage: pnpm tsx src/cli.ts ingestion batch <number>");
          }
          print(await listIngestionQueue(prisma, { batchNumber }));
          break;
        }
        if (subcommand === "list") {
          print(await listIngestionQueue(prisma, value ? { status: value } : {}));
          break;
        }
        if (subcommand === "issues") {
          print(await listIngestionQueue(prisma, { issuesOnly: true }));
          break;
        }
        throw new Error(
          "Usage: pnpm tsx src/cli.ts ingestion <stats|list [status]|batch <number>|issues>",
        );
      }
      default:
        print({
          commands: [
            "validate",
            "import",
            "check",
            "stats",
            "spell <name-or-id>",
            "search <text>",
            "list <spell-list-id> [level]",
            "ingestion stats",
            "ingestion list [status]",
            "ingestion batch <number>",
            "ingestion issues",
          ],
        });
    }
  } finally {
    await prisma.$disconnect();
  }
}


main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
