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
  it("models Sahir-Afiyun as feat-granted access rather than a class", async () => {
    const [levels, legacyLevels, relationship] = await Promise.all([
      prisma.spellLevel.findMany({
        where: { spellListId: "spell-list.sahir-afiyun" },
        select: { listKind: true },
      }),
      prisma.spellLevel.count({
        where: { spellListId: "spell-list.sahirafiyun" },
      }),
      prisma.ruleRelationship.findUnique({
        where: {
          id: "feat.sahir-afiyun:grants_spell_access:spell-list.sahir-afiyun",
        },
      }),
    ]);

    expect(levels).toHaveLength(17);
    expect(levels.every((level) => level.listKind === "feat")).toBe(true);
    expect(legacyLevels).toBe(0);
    expect(relationship).toEqual(expect.objectContaining({
      ownerEntityId: "feat.sahir-afiyun",
      ownerKind: "registry_entity",
      relationshipType: "grants_spell_access",
      targetEntityId: "spell-list.sahir-afiyun",
      status: "accepted",
    }));
  });

  it("keeps inherited class access distinct from printed spell-page values", async () => {
    const expectedDerivedCounts = {
      "spell-list.arcanist": 5,
      "spell-list.hunter": 7,
      "spell-list.investigator": 7,
      "spell-list.omdura": 1238,
      "spell-list.oracle": 12,
      "spell-list.skald": 19,
      "spell-list.warpriest": 6,
    } as const;

    for (const [spellListId, count] of Object.entries(expectedDerivedCounts)) {
      expect(await prisma.spellLevel.count({
        where: { spellListId, accessBasis: "derived" },
      })).toBe(count);
    }

    const omduraLevels = await prisma.spellLevel.groupBy({
      by: ["spellLevel"],
      where: { spellListId: "spell-list.omdura", accessBasis: "derived" },
      _count: { _all: true },
      orderBy: { spellLevel: "asc" },
    });
    expect(Object.fromEntries(omduraLevels.map((row) => [row.spellLevel, row._count._all])))
      .toEqual({ 0: 26, 1: 212, 2: 283, 3: 257, 4: 211, 5: 132, 6: 117 });

    const light = await prisma.spellLevel.findFirst({
      where: { spellId: "spell.light", spellListId: "spell-list.omdura" },
    });
    expect(light).toEqual(expect.objectContaining({
      spellLevel: 0,
      scope: "core",
      accessBasis: "derived",
      raw: expect.stringContaining("Derived access"),
    }));
    expect(light?.derivation).toEqual(expect.objectContaining({
      rule_owner_entity_id: "class.omdura",
      rule_scope: "third_party",
      source_url: "https://www.d20pfsrd.com/classes/base-classes/omdura/",
    }));

    const explicitExceptions = [
      ["spell.waters-of-lamashtu", "spell-list.investigator", 3],
      ["spell.alpha-instinct", "spell-list.skald", 2],
      ["spell.mad-sultans-melody", "spell-list.skald", 4],
      ["spell.curse-of-the-outcast", "spell-list.skald", 5],
    ] as const;
    for (const [spellId, spellListId, spellLevel] of explicitExceptions) {
      expect(await prisma.spellLevel.findFirst({ where: { spellId, spellListId } }))
        .toEqual(expect.objectContaining({ spellLevel, accessBasis: "printed" }));
    }
    expect(await prisma.spellLevel.findFirst({
      where: { spellId: "spell.besmaras-grasping-depths", spellListId: "spell-list.warpriest" },
    })).toEqual(expect.objectContaining({ spellLevel: 6, accessBasis: "derived" }));
  });

  it("registers NPC classes and the Adept spell-list owner", async () => {
    const [npcClasses, relationship] = await Promise.all([
      prisma.entity.findMany({
        where: { type: "npc_class" },
        select: { id: true },
        orderBy: { id: "asc" },
      }),
      prisma.ruleRelationship.findUnique({
        where: { id: "npc-class.adept:owns_spell_list:spell-list.adept" },
      }),
    ]);

    expect(npcClasses.map((entity) => entity.id)).toEqual([
      "npc-class.adept",
      "npc-class.aristocrat",
      "npc-class.commoner",
      "npc-class.expert",
      "npc-class.warrior",
    ]);
    expect(relationship).toEqual(expect.objectContaining({
      relationshipType: "owns_spell_list",
      targetEntityId: "spell-list.adept",
    }));
  });

  it("normalizes every AoN Red Mantis Assassin catalog membership", async () => {
    const [levels, compactLevels, catalogObservations] = await Promise.all([
      prisma.spellLevel.findMany({
        where: { spellListId: "spell-list.red-mantis-assassin" },
        select: { spellId: true, spellLevel: true },
      }),
      prisma.spellLevel.count({
        where: { spellListId: "spell-list.redmantisassassin" },
      }),
      prisma.spellSummaryObservation.findMany({
        where: {
          spellListId: "spell-list.red-mantis-assassin",
          siteId: "aon",
        },
        select: { spellId: true, spellLevel: true, sourceUrl: true },
      }),
    ]);
    const catalogKeys = new Set(
      catalogObservations.map((entry) => `${entry.spellId}:${entry.spellLevel}`),
    );

    expect(levels).toHaveLength(274);
    expect(compactLevels).toBe(0);
    expect(catalogObservations).toHaveLength(274);
    expect(levels.every((entry) =>
      catalogKeys.has(`${entry.spellId}:${entry.spellLevel}`)
    )).toBe(true);
    expect(catalogObservations.every((entry) =>
      entry.sourceUrl === "https://www.aonprd.com/Spells.aspx?Class=RedMantisAssassin"
    )).toBe(true);
  });

  it("marks every enabled legacy 3.5 spell and list membership", async () => {
    const spells = await prisma.canonicalSpell.findMany({
      where: { legacy35Material: true },
      include: { levels: true },
      orderBy: { name: "asc" },
    });
    const levels = spells.flatMap((spell) => spell.levels);
    const printedLevels = levels.filter((level) => level.accessBasis === "printed");
    const derivedLevels = levels.filter((level) => level.accessBasis === "derived");

    expect(spells).toHaveLength(27);
    expect(printedLevels).toHaveLength(115);
    expect(derivedLevels).toHaveLength(12);
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

  it("adds reviewed secondary-catalog class memberships with explicit provenance", async () => {
    const expectedMemberships = [
      ["spell.covetous-aura", "spell-list.bard", 5],
      ["spell.death-pact", "spell-list.mesmerist", 5],
      ["spell.death-pact", "spell-list.psychic", 6],
      ["spell.deceitful-veneer", "spell-list.witch", 5],
      ["spell.ether-step", "spell-list.summoner", 5],
      ["spell.expeditious-excavation", "spell-list.bloodrager", 1],
      ["spell.greensight", "spell-list.ranger", 2],
      ["spell.healing-leak", "spell-list.sorcerer", 3],
      ["spell.impenetrable-veil", "spell-list.witch", 9],
      ["spell.massacre", "spell-list.shaman", 9],
      ["spell.pack-empathy", "spell-list.witch", 3],
      ["spell.pocketful-of-vipers", "spell-list.ranger", 3],
      ["spell.see-beyond", "spell-list.sorcerer", 3],
      ["spell.shackle", "spell-list.summoner", 2],
    ] as const;

    for (const [spellId, spellListId, spellLevel] of expectedMemberships) {
      const [level, spell] = await Promise.all([
        prisma.spellLevel.findFirst({
          where: { spellId, spellListId, spellLevel },
        }),
        prisma.canonicalSpell.findUnique({ where: { spellId } }),
      ]);
      const payload = spell?.payload as {
        normalization?: { warnings?: Array<{ code?: string }> };
        provenance?: Array<{
          field_path?: string;
          observation_id?: string;
          decision?: string;
        }>;
      } | undefined;

      expect(level).not.toBeNull();
      expect(payload?.normalization?.warnings).toContainEqual(expect.objectContaining({
        code: "REVIEWED_CATALOG_MEMBERSHIP_UNION",
      }));
      expect(payload?.provenance).toContainEqual(expect.objectContaining({
        field_path: expect.stringMatching(/^\/levels\/\d+$/),
        observation_id: expect.stringMatching(/^d20pfsrd:/),
        decision: "manually_resolved",
      }));
    }
  });

  it("keeps reviewed AoN levels instead of adding conflicting catalog levels", async () => {
    const expectedLevels = [
      ["spell.alpha-instinct", "spell-list.mesmerist", [2]],
      ["spell.horrific-doubles", "spell-list.mesmerist", [3]],
      ["spell.horrific-doubles", "spell-list.psychic", [3]],
      ["spell.improve-trap", "spell-list.inquisitor", [3]],
      ["spell.positive-pulse-greater", "spell-list.paladin", [4]],
      ["spell.positive-pulse-greater", "spell-list.summoner", [4]],
      ["spell.soothing-word", "spell-list.ranger", [2]],
      ["spell.vinetrap", "spell-list.cleric", [8]],
      ["spell.vinetrap", "spell-list.druid", [8]],
      ["spell.vinetrap", "spell-list.oracle", [8]],
      ["spell.wither-limb", "spell-list.spiritualist", [6]],
    ] as const;

    for (const [spellId, spellListId, spellLevels] of expectedLevels) {
      const [levels, spell] = await Promise.all([
        prisma.spellLevel.findMany({
          where: { spellId, spellListId },
          orderBy: { spellLevel: "asc" },
          select: { spellLevel: true },
        }),
        prisma.canonicalSpell.findUnique({ where: { spellId } }),
      ]);
      const payload = spell?.payload as {
        normalization?: { warnings?: Array<{ code?: string }> };
      } | undefined;

      expect(levels.map((level) => level.spellLevel)).toEqual(spellLevels);
      expect(payload?.normalization?.warnings).toContainEqual(expect.objectContaining({
        code: "REVIEWED_AON_LEVEL_SELECTION",
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
