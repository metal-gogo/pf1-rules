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
  it("marks every enabled legacy 3.5 spell and list membership", async () => {
    const spells = await prisma.canonicalSpell.findMany({
      where: { legacy35Material: true },
      include: { levels: true },
      orderBy: { name: "asc" },
    });
    const levels = spells.flatMap((spell) => spell.levels);

    expect(spells).toHaveLength(23);
    expect(levels).toHaveLength(115);
    expect(levels.every((level) => level.scope === "legacy_3_5")).toBe(true);
    expect(spells.map((spell) => spell.name)).toContain("Pattern Recognition");
    expect(spells.every((spell) => {
      const payload = spell.payload as {
        legacy_3_5_material?: boolean;
        normalization?: { warnings?: Array<{ code?: string }> };
      };
      return payload.legacy_3_5_material === true &&
        payload.normalization?.warnings?.some(
          (warning) => warning.code === "LEGACY_3_5_MATERIAL",
        );
    })).toBe(true);
  });

  it("keeps the reviewed Abundant Ammunition range override auditable", async () => {
    const abundantAmmunition = await prisma.canonicalSpell.findUnique({
      where: { spellId: "spell.abundant-ammunition" },
    });
    const payload = abundantAmmunition?.payload as {
      normalization?: { warnings?: Array<{ code?: string; field_path?: string }> };
      provenance?: Array<{ field_path?: string; decision?: string }>;
    } | undefined;

    expect(abundantAmmunition).toEqual(expect.objectContaining({
      rangeCategory: "touch",
      rangeFormula: null,
      rangeRaw: null,
    }));
    expect(payload?.normalization?.warnings).toContainEqual(expect.objectContaining({
      code: "REVIEWED_RANGE_OVERRIDE",
      field_path: "/effect/range",
    }));
    expect(payload?.provenance).toContainEqual(expect.objectContaining({
      field_path: "/effect/range",
      decision: "manually_resolved",
    }));
  });

  it("keeps reviewed blank Range overrides auditable without inventing printed values", async () => {
    const expectations = [
      ["spell.aura-of-distraction", "personal", null, "spell_raw.delivery_fields_raw"],
      ["spell.ban-corruption", "personal", null, "spell_raw.delivery_fields_raw"],
      ["spell.blaze-of-glory", "personal", null, "spell_raw.delivery_fields_raw"],
      ["spell.burst-of-force", "personal", null, "spell_raw.delivery_fields_raw"],
      ["spell.conditional-favor", "touch", null, "spell_raw.range_raw"],
      ["spell.damnation", "personal", null, "spell_raw.delivery_fields_raw"],
      ["spell.frozen-note", "personal", null, "spell_raw.delivery_fields_raw"],
      ["spell.hammer-of-mending", "personal", null, "spell_raw.delivery_fields_raw"],
      ["spell.healing-flames", "personal", null, "spell_raw.delivery_fields_raw"],
      ["spell.massacre", "distance", "60-ft. line", "spell_raw.delivery_fields_raw"],
      ["spell.stone-throwing", "touch", null, "spell_raw.delivery_fields_raw"],
      ["spell.telekinetic-storm", "personal", null, "spell_raw.delivery_fields_raw"],
    ] as const;

    for (const [spellId, rangeCategory, rangeFormula, sourceField] of expectations) {
      const spell = await prisma.canonicalSpell.findUnique({ where: { spellId } });
      const payload = spell?.payload as {
        normalization?: { warnings?: Array<{ code?: string; field_path?: string }> };
        provenance?: Array<{
          field_path?: string;
          source_field?: string;
          decision?: string;
          note?: string;
        }>;
      } | undefined;

      expect(spell).toEqual(expect.objectContaining({
        rangeCategory,
        rangeFormula,
        rangeRaw: null,
        normalizationStatus: "validated",
      }));
      expect(payload?.normalization?.warnings).toContainEqual(expect.objectContaining({
        code: "REVIEWED_RANGE_OVERRIDE",
        field_path: "/effect/range",
      }));
      expect(payload?.normalization?.warnings).not.toContainEqual(expect.objectContaining({
        code: "MISSING_PRINTED_RANGE",
        field_path: "/effect/range",
      }));
      expect(payload?.provenance).toContainEqual(expect.objectContaining({
        field_path: "/effect/range",
        source_field: sourceField,
        decision: "manually_resolved",
        note: expect.stringContaining("Reviewed project decision"),
      }));
    }
  });

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

  it("persists mystery access on the base class list without flattening it", async () => {
    const fireball = await findSpell(prisma, "Fireball");
    const flameMystery = fireball?.levels.find((level) =>
      level.spellListId === "spell-list.oracle" &&
      level.qualifications.some((qualification) => qualification.kind === "mystery")
    );

    expect(flameMystery).toEqual(expect.objectContaining({
      listKind: "class",
      listName: "oracle",
      spellLevel: 3,
    }));
    expect(flameMystery?.qualifications).toContainEqual(expect.objectContaining({
      kind: "mystery",
      payload: {
        kind: "mystery",
        mystery: { entity_id: "mystery.flame", name: "flame" },
        raw: "Mystery flame",
      },
    }));
    expect(fireball?.levels.map((level) => level.spellListId))
      .not.toContain("spell-list.flame-mystery");
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

    const legacySummary = await prisma.spellSummaryObservation.findFirst({
      where: { spellId: "spell.enhanced-diplomacy" },
    });
    expect(legacySummary?.spellName).toBe("Enhanced Diplomacy");
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
    expect(summary.byStatus).toEqual({ ingested: 53 });
    expect(summary.batches).toHaveLength(6);
  });

  it("derives ingested status after enabling the legacy 3.5 scope", async () => {
    const ingested = await listIngestionQueue(prisma, { status: "ingested" });
    expect(ingested).toHaveLength(53);
    expect(ingested.map((item) => item.entityId)).toContain("spell.light");
    expect(ingested.map((item) => item.entityId)).toContain("spell.enhanced-diplomacy");
    expect(ingested.map((item) => item.entityId)).toContain("spell.sign-of-the-dawnflower");

    const issues = await listIngestionQueue(prisma, { issuesOnly: true });
    expect(issues).toHaveLength(0);
  });
});
