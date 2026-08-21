import { describe, expect, it } from "vitest";

import {
  resolveSpellInheritance,
  SpellInheritanceError,
  validateSpellInheritance,
  type InheritableSpell,
  type SpellInheritanceRule,
} from "../src/domain/spell-inheritance.js";
import {
  detectSpellInheritance,
  normalizeUnresolvedSpellReference,
  resolveCanonicalSpellReference,
} from "../src/ingestion/normalize-level-zero.js";
import type { ParsedSpellPage } from "../src/ingestion/spell-page-parser.js";


function spell(
  spellId: string,
  effect: Record<string, unknown>,
  rulesInheritance: SpellInheritanceRule[] = [],
): InheritableSpell {
  return {
    spell_id: spellId,
    effect,
    description: { raw: spellId },
    rules_inheritance: rulesInheritance,
  };
}


function rule(
  fromSpellId: string,
  overrides: SpellInheritanceRule["overrides"] = [],
): SpellInheritanceRule {
  return {
    from_spell_id: fromSpellId,
    relationship: "functions_like",
    inherited_paths: ["/effect"],
    overrides,
    resolution_status: "resolved",
  };
}


function parsedDescription(descriptionRaw: string, linkName?: string): ParsedSpellPage {
  return {
    descriptionRaw,
    links: linkName ? [{
      anchorTextRaw: linkName,
      hrefRaw: `/spells/${linkName}`,
      hrefResolved: `https://example.test/spells/${linkName}`,
      sourceField: "spell_raw.description_raw",
      contextRaw: linkName,
      roleHint: "cross_reference",
      targetEntityTypeHint: "spell",
      targetEntityIdHint: `spell.${linkName.replaceAll(" ", "-")}`,
    }] : [],
  } as unknown as ParsedSpellPage;
}


describe("spell inheritance", () => {
  it("resolves chained greater, mass, and communal-style overrides", () => {
    const base = spell("spell.base", { range: "touch", targets: 1, dice: "1d8", duration: 10 });
    const greater = spell(
      "spell.base-greater",
      { range: "touch", targets: 1, dice: "2d8", duration: 10 },
      [rule("spell.base", [{
        path: "/effect/dice",
        value: "2d8",
        source_field: "spell_raw.description_raw",
        raw: "2d8",
      }])],
    );
    const mass = spell(
      "spell.base-mass",
      { range: "touch", targets: "one/level", dice: "2d8", duration: 10 },
      [rule("spell.base-greater", [{
        path: "/effect/targets",
        value: "one/level",
        source_field: "spell_raw.target_raw",
        raw: "one creature/level",
      }])],
    );
    const communal = spell(
      "spell.base-mass-communal",
      { range: "touch", targets: "one/level", dice: "2d8", duration: "divided" },
      [rule("spell.base-mass", [{
        path: "/effect/duration",
        value: "divided",
        source_field: "spell_raw.description_raw",
        raw: "divide the duration among creatures touched",
      }])],
    );

    validateSpellInheritance([base, greater, mass, communal]);
    const resolved = resolveSpellInheritance([base, greater, mass, communal], communal.spell_id);

    expect(resolved.record.effect).toEqual({
      range: "touch",
      targets: "one/level",
      dice: "2d8",
      duration: "divided",
    });
    expect(resolved.lineage).toEqual(["spell.base", "spell.base-greater", "spell.base-mass"]);
    expect(resolved.applied.map((item) => item.spellId)).toEqual([
      "spell.base-greater",
      "spell.base-mass",
      "spell.base-mass-communal",
    ]);
  });

  it("detects an inherited value changed without an explicit override", () => {
    const base = spell("spell.base", { range: "touch", targets: 1 });
    const child = spell("spell.child", { range: "close", targets: 1 }, [rule("spell.base")]);

    expect(() => validateSpellInheritance([base, child])).toThrowError(
      expect.objectContaining<Partial<SpellInheritanceError>>({ code: "undeclared_override" }),
    );
  });

  it("rejects cycles with the full dependency path", () => {
    const left = spell("spell.left", { value: 1 }, [rule("spell.right")]);
    const right = spell("spell.right", { value: 1 }, [rule("spell.left")]);

    expect(() => resolveSpellInheritance([left, right], left.spell_id)).toThrowError(
      /spell\.left -> spell\.right -> spell\.left/,
    );
  });

  it("allows an explicitly unresolved missing parent but will not materialize it", () => {
    const child = spell("spell.child", { value: 1 }, [{
      ...rule("spell.missing"),
      inherited_paths: [],
      resolution_status: "missing_parent",
    }]);

    expect(() => validateSpellInheritance([child])).not.toThrow();
    expect(() => resolveSpellInheritance([child], child.spell_id)).toThrowError(
      expect.objectContaining<Partial<SpellInheritanceError>>({ code: "missing_parent" }),
    );
  });

  it("requires every override to fall within an inherited path", () => {
    const base = spell("spell.base", { value: 1 });
    const child = spell("spell.child", { value: 1 }, [rule("spell.base", [{
      path: "/description/raw",
      value: "child",
      source_field: "spell_raw.description_raw",
      raw: "child",
    }])]);

    expect(() => validateSpellInheritance([base, child])).toThrowError(
      expect.objectContaining<Partial<SpellInheritanceError>>({ code: "invalid_path" }),
    );
  });

  it("detects explicit inheritance and reconciles leading mass names", () => {
    const parent = spell("spell.cure-light-wounds-mass", { value: 1 });
    parent.name = "Cure Light Wounds, Mass";

    expect(detectSpellInheritance(
      parsedDescription(
        "This spell functions like mass cure light wounds, except that it cures 3d8 points of damage.",
        "mass cure light wounds",
      ),
      new Map([[parent.spell_id, parent]]),
    )).toEqual(expect.objectContaining({
      parentId: "spell.cure-light-wounds-mass",
      parentName: "Cure Light Wounds, Mass",
    }));
  });

  it("does not mistake ordinary 'as part of' prose for inheritance", () => {
    expect(detectSpellInheritance(
      parsedDescription("As part of casting this spell, you select one target."),
      new Map(),
    )).toBeNull();
  });

  it("resolves source suffixes, Roman numerals, and semantic spell aliases", () => {
    const createPit = spell("spell.create-pit", { value: 1 });
    createPit.name = "Create Pit";
    const summonMonster = spell("spell.summon-monster-1", { value: 1 });
    summonMonster.name = "Summon Monster 1";
    const dispelMagic = spell("spell.dispel-magic", { value: 1 });
    dispelMagic.name = "Dispel Magic";
    const available = new Map([
      [createPit.spell_id, createPit],
      [summonMonster.spell_id, summonMonster],
      [dispelMagic.spell_id, dispelMagic],
    ]);

    expect(detectSpellInheritance(
      parsedDescription("This spell functions as per create pitAPG, except the pit moves."),
      available,
    )?.parentId).toBe(createPit.spell_id);
    expect(detectSpellInheritance(
      parsedDescription("This spell functions like summon monster I, except as noted."),
      available,
    )?.parentId).toBe(summonMonster.spell_id);
    expect(detectSpellInheritance(
      parsedDescription("This spell functions like summon monster, except it summons one creature."),
      available,
    )?.parentId).toBe(summonMonster.spell_id);
    expect(resolveCanonicalSpellReference("a targeted dispel magic spell", available)?.spell_id)
      .toBe(dispelMagic.spell_id);
  });

  it("normalizes unresolved captured spell references without preserving source decorations", () => {
    expect(normalizeUnresolvedSpellReference("Ancestral RegressionARG")).toEqual({
      spellId: "spell.ancestral-regression",
      name: "Ancestral Regression",
    });
    expect(normalizeUnresolvedSpellReference("Lesser Spellcrash")).toEqual({
      spellId: "spell.spellcrash-lesser",
      name: "Spellcrash, Lesser",
    });
  });

  it("rejects ordinary bare-as prose instead of creating dependencies", () => {
    for (const description of [
      "As any scholar of Desnan lore or astrologer can tell you, the stars move.",
      "As long as the target is smaller than you are, the spell works.",
      "As you ingest this extract, choose one formula.",
    ]) {
      expect(detectSpellInheritance(parsedDescription(description), new Map())).toBeNull();
    }
  });
});
