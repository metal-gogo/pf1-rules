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
      "spell-list.arcanist": 7,
      "spell-list.hunter": 7,
      "spell-list.investigator": 7,
      "spell-list.omdura": 1242,
      "spell-list.oracle": 12,
      "spell-list.skald": 19,
      "spell-list.summoner-unchained": 7,
      "spell-list.warpriest": 11,
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
      .toEqual({ 0: 26, 1: 213, 2: 283, 3: 258, 4: 212, 5: 134, 6: 116 });

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

    const handbookSpell = await prisma.spellLevel.findFirst({
      where: {
        spellId: "spell.alter-summoned-monster",
        spellListId: "spell-list.summoner-unchained",
      },
    });
    expect(handbookSpell).toEqual(expect.objectContaining({
      spellLevel: 2,
      accessBasis: "derived",
      raw: expect.stringContaining("Derived access"),
    }));
    expect(handbookSpell?.derivation).toEqual(expect.objectContaining({
      rule_owner_entity_id: "class.summoner-unchained",
      rule_scope: "later_first_party",
      source_url: "https://paizo.com/blog/i-can-call-spirits-from-the-vasty-deep",
      source_memberships: [{ spell_list_id: "spell-list.summoner", level: 2 }],
    }));

    expect(await prisma.spellLevel.findFirst({
      where: { spellId: "spell.alter-summoned-monster", spellListId: "spell-list.summoner" },
    })).toEqual(expect.objectContaining({ spellLevel: 2, accessBasis: "printed" }));

    const explicitExceptions = [
      ["spell.waters-of-lamashtu", "spell-list.investigator", 2, "reviewed_override"],
      ["spell.alpha-instinct", "spell-list.skald", 2, "printed"],
      ["spell.mad-sultans-melody", "spell-list.skald", 3, "reviewed_override"],
      ["spell.curse-of-the-outcast", "spell-list.skald", 4, "reviewed_override"],
    ] as const;
    for (const [spellId, spellListId, spellLevel, accessBasis] of explicitExceptions) {
      expect(await prisma.spellLevel.findFirst({ where: { spellId, spellListId } }))
        .toEqual(expect.objectContaining({ spellLevel, accessBasis }));
    }
    expect(await prisma.spellLevel.findFirst({
      where: { spellId: "spell.besmaras-grasping-depths", spellListId: "spell-list.warpriest" },
    })).toEqual(expect.objectContaining({ spellLevel: 5, accessBasis: "derived" }));
  });

  it("preserves reviewed class-list overrides and explicit exclusions", async () => {
    const [sorcererOverrides, clericOverrides] = await Promise.all([
      prisma.spellLevel.findMany({
        where: { spellListId: "spell-list.sorcerer", accessBasis: "reviewed_override" },
        select: { spellId: true, spellLevel: true },
        orderBy: { spellId: "asc" },
      }),
      prisma.spellLevel.findMany({
        where: { spellListId: "spell-list.cleric", accessBasis: "reviewed_override" },
        select: { spellId: true, spellLevel: true },
        orderBy: { spellId: "asc" },
      }),
    ]);

    expect(sorcererOverrides).toEqual([
      { spellId: "spell.blood-transcription", spellLevel: 2 },
      { spellId: "spell.deceitful-veneer", spellLevel: 5 },
      { spellId: "spell.firewalkers-meditation", spellLevel: 4 },
      { spellId: "spell.mages-lucubration", spellLevel: 6 },
      { spellId: "spell.mnemonic-enhancer", spellLevel: 4 },
      { spellId: "spell.petulengros-validation", spellLevel: 1 },
      { spellId: "spell.rite-of-centered-mind", spellLevel: 1 },
      { spellId: "spell.seers-bane", spellLevel: 6 },
      { spellId: "spell.spirit-bonds", spellLevel: 3 },
      { spellId: "spell.temporal-regression", spellLevel: 8 },
      { spellId: "spell.visualization-of-the-body", spellLevel: 2 },
      { spellId: "spell.visualization-of-the-mind", spellLevel: 2 },
    ]);
    expect(clericOverrides).toEqual([
      { spellId: "spell.besmaras-grasping-depths", spellLevel: 5 },
      { spellId: "spell.borrow-fortune", spellLevel: 3 },
      { spellId: "spell.divine-vessel", spellLevel: 8 },
      { spellId: "spell.embrace-destiny", spellLevel: 1 },
      { spellId: "spell.find-fault", spellLevel: 3 },
      { spellId: "spell.foretell-failure", spellLevel: 4 },
      { spellId: "spell.jungle-mind", spellLevel: 5 },
    ]);

    for (const spellId of ["spell.oracles-burden", "spell.oracles-vessel"]) {
      expect(await prisma.spellLevel.count({
        where: { spellId, spellListId: "spell-list.cleric" },
      })).toBe(0);
      expect(await prisma.ruleRelationship.count({
        where: {
          id: `${spellId}:appears_on_spell_list:spell-list.cleric`,
          status: "accepted",
        },
      })).toBe(0);
      expect(await prisma.decisionRelationshipItem.findFirst({
        where: {
          relationshipId: `${spellId}:appears_on_spell_list:spell-list.cleric`,
          decision: "reject",
        },
      })).not.toBeNull();
    }
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
      ["spell.torrent-of-elemental-rage", "distance", "persistent line of elements 30 ft. long", "spell_raw.delivery_fields_raw"],
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

  it("applies reviewed Foundry membership and lower-level decisions", async () => {
    const memberships = await prisma.spellLevel.findMany({
      where: {
        spellId: {
          in: [
            "spell.animus-mine",
            "spell.besmaras-grasping-depths",
            "spell.hostile-juxtaposition-greater",
            "spell.petulengros-validation",
            "spell.seers-bane",
          ],
        },
      },
    });
    const level = (spellId: string, spellListId: string) => memberships.find(
      (item) => item.spellId === spellId && item.spellListId === spellListId,
    );

    expect(level("spell.petulengros-validation", "spell-list.sorcerer"))
      .toEqual(expect.objectContaining({ spellLevel: 1, accessBasis: "reviewed_override" }));
    expect(level("spell.petulengros-validation", "spell-list.wizard"))
      .toEqual(expect.objectContaining({ spellLevel: 1, accessBasis: "reviewed_override" }));
    expect(level("spell.petulengros-validation", "spell-list.arcanist"))
      .toEqual(expect.objectContaining({ spellLevel: 1, accessBasis: "derived" }));
    expect(level("spell.seers-bane", "spell-list.arcanist"))
      .toEqual(expect.objectContaining({ spellLevel: 6, accessBasis: "derived" }));
    expect(level("spell.hostile-juxtaposition-greater", "spell-list.summoner-unchained"))
      .toEqual(expect.objectContaining({ spellLevel: 6, accessBasis: "reviewed_override" }));
    expect(level("spell.hostile-juxtaposition-greater", "spell-list.mesmerist"))
      .toEqual(expect.objectContaining({ spellLevel: 4, accessBasis: "reviewed_override" }));
    expect(level("spell.besmaras-grasping-depths", "spell-list.cleric"))
      .toEqual(expect.objectContaining({ spellLevel: 5, accessBasis: "reviewed_override" }));
    expect(level("spell.besmaras-grasping-depths", "spell-list.warpriest"))
      .toEqual(expect.objectContaining({ spellLevel: 5, accessBasis: "derived" }));
    expect(level("spell.animus-mine", "spell-list.psychic"))
      .toEqual(expect.objectContaining({ spellLevel: 2, accessBasis: "printed" }));

    expect(await prisma.spellLevel.findFirst({
      where: { spellId: "spell.banishing-blade", spellListId: "spell-list.summoner-unchained" },
    })).toEqual(expect.objectContaining({ spellLevel: 5, accessBasis: "reviewed_override" }));
    expect(await prisma.spellLevel.count({
      where: {
        spellListId: "spell-list.summoner-unchained",
        accessBasis: "reviewed_override",
      },
    })).toBe(36);
    expect(await prisma.decisionRelationshipItem.findFirst({
      where: {
        decisionId: "canonical-decision:spell.banishing-blade:v0.1",
        relationshipId: "spell.banishing-blade:appears_on_spell_list:spell-list.summoner-unchained",
      },
    })).toEqual(expect.objectContaining({ decision: "accept" }));
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

  it("keeps one reviewed lower level instead of duplicate conflicting levels", async () => {
    const expectedLevels = [
      ["spell.alpha-instinct", "spell-list.mesmerist", [2]],
      ["spell.horrific-doubles", "spell-list.mesmerist", [3]],
      ["spell.horrific-doubles", "spell-list.psychic", [3]],
      ["spell.improve-trap", "spell-list.inquisitor", [3]],
      ["spell.positive-pulse-greater", "spell-list.paladin", [3]],
      ["spell.positive-pulse-greater", "spell-list.summoner", [3]],
      ["spell.soothing-word", "spell-list.ranger", [2]],
      ["spell.vinetrap", "spell-list.cleric", [8]],
      ["spell.vinetrap", "spell-list.druid", [8]],
      ["spell.vinetrap", "spell-list.oracle", [8]],
      ["spell.wither-limb", "spell-list.spiritualist", [5]],
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

  it("models complete Oracle mystery lists outside general class access", async () => {
    const [mysteries, mysteryLists, mysteryRows, fireball] = await Promise.all([
      prisma.entity.count({ where: { type: "mystery", status: "resolved" } }),
      prisma.entity.count({
        where: { type: "spell_list", id: { endsWith: "-mystery" }, status: "resolved" },
      }),
      prisma.spellLevel.findMany({
        where: { listKind: "mystery" },
        select: { spellListId: true },
      }),
      findSpell(prisma, "Fireball"),
    ]);

    expect(mysteries).toBe(34);
    expect(mysteryLists).toBe(34);
    expect(mysteryRows).toHaveLength(306);
    expect(new Set(mysteryRows.map((row) => row.spellListId)).size).toBe(34);

    const flameMystery = fireball?.levels.find(
      (level) => level.spellListId === "spell-list.flame-mystery",
    );
    expect(flameMystery).toEqual(expect.objectContaining({
      listKind: "mystery",
      listName: "Flame Mystery",
      spellLevel: 3,
      accessBasis: "printed",
      raw: "fireball (6th)",
    }));
    expect(fireball?.levels.some((level) => level.spellListId === "spell-list.oracle"))
      .toBe(false);
    expect(await prisma.ruleRelationship.findUnique({
      where: { id: "mystery.flame:owns_spell_list:spell-list.flame-mystery" },
    })).toEqual(expect.objectContaining({
      relationshipType: "owns_spell_list",
      status: "accepted",
    }));

    const normalizedSourceName = await prisma.spellLevel.findFirst({
      where: {
        spellId: "spell.horrid-wilting",
        spellListId: "spell-list.reaper-mystery",
      },
    });
    expect(normalizedSourceName?.raw).toBe("horrid withering (16th)");
  });

  it("models complete Witch patron lists and expands the printed Water alternative", async () => {
    const [patrons, patronLists, patronRows, blessWater, curseWater] = await Promise.all([
      prisma.entity.count({ where: { type: "patron", status: "resolved" } }),
      prisma.entity.count({
        where: { type: "spell_list", id: { endsWith: "-patron" }, status: "resolved" },
      }),
      prisma.spellLevel.findMany({ where: { listKind: "patron" } }),
      prisma.spellLevel.findFirst({
        where: { spellId: "spell.bless-water", spellListId: "spell-list.water-patron" },
      }),
      prisma.spellLevel.findFirst({
        where: { spellId: "spell.curse-water", spellListId: "spell-list.water-patron" },
      }),
    ]);

    expect(patrons).toBe(52);
    expect(patronLists).toBe(52);
    expect(patronRows).toHaveLength(469);
    expect(new Set(patronRows.map((row) => row.spellListId)).size).toBe(52);
    expect(blessWater).toEqual(expect.objectContaining({
      spellLevel: 1,
      accessBasis: "printed",
      raw: "2nd — bless water/curse water",
    }));
    expect(curseWater).toEqual(expect.objectContaining({
      spellLevel: 1,
      accessBasis: "printed",
      raw: "2nd — bless water/curse water",
    }));
  });

  it("models complete Shaman spirit lists", async () => {
    const [spirits, spiritLists, spiritRows, normalizedName] = await Promise.all([
      prisma.entity.count({ where: { type: "spirit", status: "resolved" } }),
      prisma.entity.count({
        where: { type: "spell_list", id: { endsWith: "-spirit" }, status: "resolved" },
      }),
      prisma.spellLevel.findMany({ where: { listKind: "spirit" } }),
      prisma.spellLevel.findFirst({
        where: {
          spellId: "spell.repel-metal-or-stone",
          spellListId: "spell-list.stone-spirit",
        },
      }),
    ]);

    expect(spirits).toBe(17);
    expect(spiritLists).toBe(17);
    expect(spiritRows).toHaveLength(153);
    expect(new Set(spiritRows.map((row) => row.spellListId)).size).toBe(17);
    expect(normalizedName).toEqual(expect.objectContaining({
      spellLevel: 8,
      accessBasis: "printed",
      raw: "repel metal and stone (8th)",
    }));
  });

  it("keeps Sorcerer and Bloodrager bloodline lists distinct", async () => {
    const [bloodlines, sorcererRows, bloodragerRows, legacyRows, sorcererArcane, bloodragerArcane] =
      await Promise.all([
        prisma.entity.count({ where: { type: "bloodline", status: "resolved" } }),
        prisma.spellLevel.findMany({
          where: { listKind: "bloodline", spellListId: { startsWith: "spell-list.sorcerer-" } },
        }),
        prisma.spellLevel.findMany({
          where: { listKind: "bloodline", spellListId: { startsWith: "spell-list.bloodrager-" } },
        }),
        prisma.spellLevel.count({
          where: {
            listKind: "bloodline",
            NOT: [
              { spellListId: { startsWith: "spell-list.sorcerer-" } },
              { spellListId: { startsWith: "spell-list.bloodrager-" } },
            ],
          },
        }),
        prisma.spellLevel.findFirst({
          where: { spellId: "spell.wish", spellListId: "spell-list.sorcerer-arcane-bloodline" },
        }),
        prisma.spellLevel.findFirst({
          where: { spellId: "spell.dimension-door", spellListId: "spell-list.bloodrager-arcane-bloodline" },
        }),
      ]);

    expect(bloodlines).toBe(75);
    expect(sorcererRows).toHaveLength(459);
    expect(bloodragerRows).toHaveLength(96);
    expect(legacyRows).toBe(0);
    expect(sorcererArcane).toEqual(expect.objectContaining({ spellLevel: 9, accessBasis: "printed" }));
    expect(bloodragerArcane).toEqual(expect.objectContaining({ spellLevel: 4, accessBasis: "printed" }));
  });

  it("models domain owners and derives effective subdomain lists", async () => {
    const [domains, subdomains, domainRows, subdomainRows, cloudInherited, cloudReplacement, purityRows] =
      await Promise.all([
        prisma.entity.count({ where: { type: "domain", status: "resolved" } }),
        prisma.entity.count({ where: { type: "subdomain", status: "resolved" } }),
        prisma.spellLevel.findMany({ where: { listKind: "domain" } }),
        prisma.spellLevel.findMany({ where: { listKind: "subdomain" } }),
        prisma.spellLevel.findFirst({
          where: { spellId: "spell.wind-wall", spellListId: "spell-list.cloud-subdomain" },
        }),
        prisma.spellLevel.findFirst({
          where: { spellId: "spell.solid-fog", spellListId: "spell-list.cloud-subdomain" },
        }),
        prisma.spellLevel.findMany({ where: { spellListId: "spell-list.purity-subdomain" } }),
      ]);

    expect(domains).toBe(35);
    expect(subdomains).toBe(136);
    expect(domainRows).toHaveLength(315);
    expect(subdomainRows).toHaveLength(1353);
    expect(new Set(subdomainRows.map((row) => row.spellListId)).size).toBe(150);
    expect(cloudInherited).toEqual(expect.objectContaining({
      spellLevel: 2,
      accessBasis: "derived",
      raw: "Inherited from Air Domain: 2nd—wind wall",
    }));
    expect(cloudInherited?.derivation).toEqual(expect.objectContaining({
      rule_owner_entity_id: "subdomain.cloud",
      source_memberships: [{ spell_list_id: "spell-list.air-domain", level: 2 }],
    }));
    expect(cloudReplacement).toEqual(expect.objectContaining({
      spellLevel: 4,
      accessBasis: "printed",
      raw: "4th—solid fog",
    }));
    expect(purityRows).toHaveLength(12);
    expect(await prisma.ruleRelationship.findUnique({
      where: { id: "subdomain.cloud:inherits_spell_list:spell-list.air-domain" },
    })).toEqual(expect.objectContaining({ relationshipType: "inherits_spell_list" }));
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
