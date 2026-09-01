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
      d20pfsrd_anchor: 28,
    });
    expect(audit.enriched_variants).toHaveLength(17);
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
    expect(variant("darkness-mythic.json").rules_text.document).toBeUndefined();
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
});
