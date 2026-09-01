import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  richTextBlockInlines,
  richTextLeafText,
  type RichTextDocument,
} from "../src/domain/rich-text.js";


const variantsDirectory = path.resolve("data/variants");

function variant(filename: string): any {
  return JSON.parse(fs.readFileSync(path.join(variantsDirectory, filename), "utf8"));
}

function links(document: RichTextDocument) {
  return document.content.flatMap(richTextBlockInlines).filter((node) => node.node_type === "entity_link");
}

describe("Mythic rich text", () => {
  it("audits every Mythic variant before applying reviewed links", () => {
    const audit = JSON.parse(fs.readFileSync(path.resolve("data/reports/mythic-link-audit.json"), "utf8"));
    expect(audit.audited_variants).toBe(287);
    expect(audit.variants_with_source_anchors).toEqual([
      "mythic-spell-variant.arcane-cannon",
      "mythic-spell-variant.wish",
    ]);
    expect(audit.variants_with_only_d20pfsrd_candidates).toContain("mythic-spell-variant.darkness");
    expect(audit.links_added_by_evidence_source).toEqual({
      aon_anchor: 3,
      aon_plain_text: 11,
      d20pfsrd_anchor: 323,
    });
    expect(audit.enriched_variants).toHaveLength(180);
  });

  it("preserves raw rules text and uses source-backed relationships", () => {
    const wish = variant("wish-mythic.json");
    const document = wish.rules_text.document as RichTextDocument;
    expect(richTextLeafText(document)).toBe(wish.rules_text.raw);
    expect(links(document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "non-mythic wish", relationship_id: "mythic-spell-variant.wish:mythic_version_of:spell.wish" }),
      expect.objectContaining({ value: "afflictions", relationship_id: "mythic-spell-variant.wish:uses_definition:affliction" }),
      expect.objectContaining({ value: "resurrection", relationship_id: "mythic-spell-variant.wish:references:spell.resurrection" }),
    ]));
    expect(wish.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relationship_id: "mythic-spell-variant.wish:uses_definition:affliction",
        target: expect.objectContaining({ entity_id: "affliction" }),
      }),
    ]));

    const fireball = variant("fireball-mythic.json");
    const reflex = fireball.relationships.find((item: any) => item.target.entity_id === "saving-throw.reflex");
    expect(reflex.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ observation_id: "aon:spell.fireball:9cc0a874", evidence_kind: "plain_text" }),
      expect.objectContaining({ observation_id: "d20pfsrd:spell.fireball:d1e3b4fe", evidence_kind: "hyperlink" }),
    ]));
  });

  it("leaves ambiguous and generic terms unlinked", () => {
    const fireballLinks = links(variant("fireball-mythic.json").rules_text.document);
    expect(fireballLinks.some((node) => ["resistance", "immunity"].includes(node.value))).toBe(false);

    const wishLinks = links(variant("wish-mythic.json").rules_text.document);
    expect(wishLinks.some((node) => ["silent", "stilled"].includes(node.value))).toBe(false);
    expect(links(variant("darkness-mythic.json").rules_text.document).some((node) => node.value === "fear")).toBe(false);
  });

  it("applies deterministic batch 01 and rejects unsafe migrated targets", () => {
    const filenames = [
      "mythic-ablative-barrier.json",
      "mythic-animal-aspect.json",
      "mythic-animate-dead.json",
      "mythic-animate-objects.json",
      "mythic-animate-plants.json",
      "mythic-antimagic-field.json",
      "mythic-arboreal-hammer.json",
      "mythic-arcane-cannon.json",
      "mythic-baleful-polymorph.json",
      "mythic-bane.json",
    ];
    for (const filename of filenames) {
      const record = variant(filename);
      expect(richTextLeafText(record.rules_text.document)).toBe(record.rules_text.raw);
    }

    const objectsLinks = links(variant("mythic-animate-objects.json").rules_text.document);
    expect(objectsLinks.some((node) => node.value === "hit points")).toBe(true);
    expect(objectsLinks.some((node) => node.value === "Strength")).toBe(false);

    const cannonLinks = links(variant("mythic-arcane-cannon.json").rules_text.document);
    expect(cannonLinks.some((node) => node.value === "conductive")).toBe(true);
    expect(cannonLinks.some((node) => node.value === "hardness")).toBe(false);

    const hammer = variant("mythic-arboreal-hammer.json");
    const fortitude = hammer.relationships.find((item: any) => item.target.entity_id === "saving-throw.fortitude");
    expect(fortitude.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        observation_id: "d20pfsrd:spell.arboreal-hammer:5a3e3f039972b7c2",
        anchor_text_raw: "Fortitude",
      }),
    ]));
  });

  it("applies deterministic batch 02 and keeps ambiguous candidates unlinked", () => {
    const filenames = [
      "mythic-barkskin.json",
      "mythic-battle-trance.json",
      "mythic-black-mark.json",
      "mythic-black-tentacles.json",
      "mythic-blade-barrier.json",
      "mythic-blasphemy.json",
      "mythic-bless.json",
      "mythic-blinding-ray.json",
      "mythic-blindness-deafness.json",
      "mythic-blink.json",
      "mythic-blood-crow-strike.json",
      "mythic-boiling-blood.json",
      "mythic-break.json",
      "mythic-breath-of-life.json",
      "mythic-burning-gaze.json",
      "mythic-burning-hands.json",
      "mythic-call-animal.json",
      "mythic-cape-of-wasps.json",
      "mythic-chain-lightning.json",
      "mythic-chaos-hammer.json",
      "mythic-chill-metal.json",
      "mythic-chord-of-shards.json",
      "mythic-circle-of-death.json",
      "mythic-cloudkill.json",
    ];
    for (const filename of filenames) {
      const record = variant(filename);
      expect(richTextLeafText(record.rules_text.document)).toBe(record.rules_text.raw);
    }

    const barkskin = variant("mythic-barkskin.json");
    expect(links(barkskin.rules_text.document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "enhancement bonus", relationship_id: "mythic-spell-variant.barkskin:uses_definition:bonus.enhancement" }),
      expect.objectContaining({ value: "natural armor bonus", relationship_id: "mythic-spell-variant.barkskin:uses_definition:bonus.natural-armor" }),
    ]));
    for (const relationship of barkskin.relationships) {
      expect(relationship.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ observation_id: expect.stringMatching(/^aon:/), evidence_kind: "plain_text" }),
        expect.objectContaining({ observation_id: expect.stringMatching(/^d20pfsrd:/), evidence_kind: "hyperlink" }),
      ]));
    }

    const blinkLinks = links(variant("mythic-blink.json").rules_text.document);
    expect(blinkLinks.some((node) => node.value === "move action")).toBe(true);
    expect(blinkLinks.some((node) => node.value === "incorporeal")).toBe(false);

    for (const filename of ["mythic-blood-crow-strike.json", "mythic-boiling-blood.json"]) {
      const record = variant(filename);
      expect(links(record.rules_text.document).some((node) => node.value === "fire resistance")).toBe(true);
      const fireResistance = record.relationships.find((item: any) => item.target.entity_id === "special-ability.fire-resistance");
      expect(fireResistance.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ observation_id: expect.stringMatching(/^aon:/), anchor_text_raw: "fire resistance" }),
        expect.objectContaining({ observation_id: expect.stringMatching(/^d20pfsrd:/), anchor_text_raw: "resistance" }),
      ]));
    }

    expect(links(variant("mythic-chaos-hammer.json").rules_text.document)).toContainEqual(expect.objectContaining({
      value: "outsiders",
      relationship_id: "mythic-spell-variant.chaos-hammer:uses_definition:monster-type.outsider",
    }));
    for (const filename of ["mythic-circle-of-death.json", "mythic-cloudkill.json"]) {
      expect(links(variant(filename).rules_text.document)).toContainEqual(expect.objectContaining({
        value: "Hit Dice",
        relationship_id: expect.stringContaining(":uses_definition:hit-die"),
      }));
    }

    expect(links(variant("mythic-call-lightning.json").rules_text.document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "dazzled", relationship_id: "mythic-spell-variant.call-lightning:uses_definition:condition.dazzled" }),
      expect.objectContaining({ value: "deafened", relationship_id: "mythic-spell-variant.call-lightning:uses_definition:condition.deafened" }),
    ]));
  });

  it("applies deterministic batch 03 and preserves canonical target choices", () => {
    const colorSpray = variant("mythic-color-spray.json");
    expect(richTextLeafText(colorSpray.rules_text.document)).toBe(colorSpray.rules_text.raw);
    expect(links(colorSpray.rules_text.document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "Hit Dice", relationship_id: "mythic-spell-variant.color-spray:uses_definition:hit-die" }),
      expect.objectContaining({ value: "unconscious", relationship_id: "mythic-spell-variant.color-spray:uses_definition:condition.unconscious" }),
    ]));

    const coneLinks = links(variant("mythic-cone-of-cold.json").rules_text.document);
    expect(coneLinks).toContainEqual(expect.objectContaining({ value: "Strength", relationship_id: "mythic-spell-variant.cone-of-cold:uses_definition:ability-score.strength" }));
    expect(coneLinks).toContainEqual(expect.objectContaining({ value: "incorporeal", relationship_id: "mythic-spell-variant.cone-of-cold:uses_definition:creature-subtype.incorporeal" }));

    const falseLife = variant("mythic-false-life.json");
    const casterLevel = falseLife.relationships.find((item: any) => item.target.entity_id === "spellcasting.caster-level");
    expect(casterLevel.evidence.filter((item: any) => item.evidence_kind === "hyperlink")).toHaveLength(2);

    const fireStormLinks = links(variant("mythic-fire-storm.json").rules_text.document);
    expect(fireStormLinks.some((node) => node.value === "caster level")).toBe(true);
    expect(fireStormLinks.some((node) => ["resistance", "immunity"].includes(node.value))).toBe(false);
    expect(links(variant("mythic-dimension-door.json").rules_text.document)).toContainEqual(expect.objectContaining({
      value: "caster level",
      relationship_id: "mythic-spell-variant.dimension-door:uses_definition:spellcasting.caster-level",
    }));
    expect(links(variant("mythic-dragons-breath.json").rules_text.document).some((node) => node.value === "dragon’s breath")).toBe(false);
    expect(links(variant("mythic-dust-of-twilight.json").rules_text.document).some((node) => node.value === "dust of twilight")).toBe(false);
  });

  it("applies the final evidence-backed batch and leaves misleading candidates unlinked", () => {
    const darkness = variant("darkness-mythic.json");
    expect(richTextLeafText(darkness.rules_text.document)).toBe(darkness.rules_text.raw);
    expect(links(darkness.rules_text.document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "darkvision", relationship_id: "mythic-spell-variant.darkness:uses_definition:special-ability.darkvision" }),
      expect.objectContaining({ value: "see in darkness", relationship_id: "mythic-spell-variant.darkness:uses_definition:universal-monster-rule.see-in-darkness" }),
    ]));
    expect(links(darkness.rules_text.document).some((node) => node.value === "fear")).toBe(false);

    const vampiricTouchLinks = links(variant("mythic-vampiric-touch.json").rules_text.document);
    expect(vampiricTouchLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "fast healing", relationship_id: "mythic-spell-variant.vampiric-touch:uses_definition:universal-monster-rule.fast-healing" }),
      expect.objectContaining({ value: "touch attack", relationship_id: "mythic-spell-variant.vampiric-touch:uses_definition:attack.touch" }),
    ]));

    const searingLightLinks = links(variant("mythic-searing-light.json").rules_text.document);
    expect(searingLightLinks).toContainEqual(expect.objectContaining({ value: "constructs", relationship_id: "mythic-spell-variant.searing-light:uses_definition:monster-type.construct" }));
    expect(searingLightLinks.some((node) => node.value === "vulnerable")).toBe(false);

    for (const filename of ["mythic-resonating-word.json", "mythic-time-stop.json"]) {
      expect(variant(filename).rules_text.document).toBeUndefined();
    }
  });
});
