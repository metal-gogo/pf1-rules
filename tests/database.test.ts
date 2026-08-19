import { beforeAll, describe, expect, it } from "vitest";

import { createLocalPrisma } from "../src/db/client.js";
import { checkDatabase } from "../src/ingestion/importer.js";
import {
  findSpell,
  ingestionQueueSummary,
  listIngestionQueue,
  searchRules,
  spellsForList,
} from "../src/query/spells.js";


const prisma = createLocalPrisma();

beforeAll(async () => {
  await checkDatabase(prisma);
});

describe("ingested spell catalog", () => {
  it("keeps Wish's mandatory diamond component", async () => {
    const wish = await findSpell(prisma, "Wish");
    expect(wish?.components).toContainEqual(
      expect.objectContaining({ componentScope: "required", costGp: 25_000 }),
    );
    expect(wish?.mythicVariant?.id).toBe("mythic-spell-variant.wish");
  });

  it("keeps Miracle's 25,000 gp cost conditional", async () => {
    const miracle = await findSpell(prisma, "Miracle");
    expect(miracle?.components).toContainEqual(
      expect.objectContaining({ componentScope: "conditional", costGp: 25_000 }),
    );
    expect(miracle?.mythicVariant).toBeNull();
  });

  it("searches canonical and mythic rules", async () => {
    const result = await searchRules(prisma, "afflictions");
    expect(result.spells.map((spell) => spell.spellId)).toContain("spell.wish");
    expect(result.mythicVariants.map((variant) => variant.id)).toContain(
      "mythic-spell-variant.wish",
    );
  });

  it("filters spell access by list and level", async () => {
    const clericNine = await spellsForList(prisma, "spell-list.cleric", 9);
    expect(clericNine.map((entry) => entry.spell.spellId)).toContain("spell.miracle");
  });

  it("tracks the complete level-0 ingestion catalog", async () => {
    const summary = await ingestionQueueSummary(prisma);
    expect(summary.total).toBe(53);
    expect(summary.byStatus).toEqual({
      pending: 50,
      scope_issue: 2,
      ingested: 1,
    });
    expect(summary.batches).toHaveLength(6);
  });

  it("derives ingested status and preserves explicit scope issues", async () => {
    const ingested = await listIngestionQueue(prisma, { status: "ingested" });
    expect(ingested.map((item) => item.entityId)).toEqual(["spell.light"]);

    const issues = await listIngestionQueue(prisma, { issuesOnly: true });
    expect(issues.map((item) => item.entityId)).toEqual([
      "spell.enhanced-diplomacy",
      "spell.sign-of-the-dawnflower",
    ]);
    expect(issues.every((item) => item.status === "scope_issue")).toBe(true);
  });
});
