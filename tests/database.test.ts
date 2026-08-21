import { beforeAll, describe, expect, it } from "vitest";

import { createLocalPrisma } from "../src/db/client.js";
import { checkDatabase } from "../src/ingestion/importer.js";
import {
  findSpell,
  findResolvedSpell,
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

  it("preserves catalog summaries and selects a sourced canonical description", async () => {
    const light = await prisma.canonicalSpell.findUnique({
      where: { spellId: "spell.light" },
      include: { shortDescriptionSource: true },
    });

    expect(light?.shortDescription).toBe("Object shines like a torch.");
    expect(light?.shortDescriptionSource).toEqual(expect.objectContaining({
      spellId: "spell.light",
      spellListId: "spell-list.adept",
      spellLevel: 0,
      siteId: "aon",
      summaryRaw: "Object shines like a torch.",
      sourceUrl: "https://www.aonprd.com/Spells.aspx?Class=Adept",
      parserName: "aon-level-zero-class-catalog",
    }));

    const clericSummary = await prisma.spellSummaryObservation.findFirst({
      where: { spellId: "spell.light", spellListId: "spell-list.cleric" },
    });
    expect(clericSummary?.summaryRaw).toBe("Object shines like a torch.");
    expect(clericSummary?.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("materializes inherited spell rules with an auditable trace", async () => {
    const cureModerate = await findResolvedSpell(prisma, "Cure Moderate Wounds");

    expect(cureModerate?.record.spell_id).toBe("spell.cure-moderate-wounds");
    expect(cureModerate?.lineage).toEqual(["spell.cure-light-wounds"]);
    expect(cureModerate?.applied).toContainEqual(expect.objectContaining({
      fromSpellId: "spell.cure-light-wounds",
      inheritedPaths: ["/casting", "/effect", "/description/raw"],
      overridePaths: ["/description/raw"],
    }));
    expect((cureModerate?.record.description as { raw: string }).raw).toContain("2d8 points");
  });

  it("tracks the complete level-0 ingestion catalog", async () => {
    const summary = await ingestionQueueSummary(prisma);
    expect(summary.total).toBe(53);
    expect(summary.byStatus).toEqual({
      ingested: 51,
      scope_issue: 2,
    });
    expect(summary.batches).toHaveLength(6);
  });

  it("derives ingested status and preserves explicit scope issues", async () => {
    const ingested = await listIngestionQueue(prisma, { status: "ingested" });
    expect(ingested).toHaveLength(51);
    expect(ingested.map((item) => item.entityId)).toContain("spell.light");

    const issues = await listIngestionQueue(prisma, { issuesOnly: true });
    expect(issues).toHaveLength(2);
    expect(issues.filter((item) => item.status === "scope_issue").map((item) => item.entityId)).toEqual([
      "spell.enhanced-diplomacy",
      "spell.sign-of-the-dawnflower",
    ]);
    expect(issues.every((item) => item.status.endsWith("_issue"))).toBe(true);
  });
});
