import fs from "node:fs";
import path from "node:path";

import Ajv2020Module from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { projectRoot } from "../src/config.js";
import type { ValidatedJson } from "../src/domain/json.js";
import {
  comparableRichText,
  linkRichTextDocument,
  parseRichTextHtml,
  richTextLeafText,
  type RichTextDocument,
} from "../src/domain/rich-text.js";
import { resolveCanonicalSpellReference } from "../src/ingestion/normalize-level-zero.js";
import { parseAonSpell } from "../src/ingestion/spell-page-parser.js";


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function canonical(slug: string): ValidatedJson {
  return loadJson(path.join(projectRoot, "data", "canonical", `${slug}.json`));
}


function parsedObservation(relativeFilename: string) {
  const filename = path.join(projectRoot, "data", "observations", relativeFilename);
  const observation = loadJson(filename);
  const artifact = path.resolve(
    path.dirname(filename),
    observation.retrieval.raw_artifact_path,
  );
  return parseAonSpell(fs.readFileSync(artifact, "utf8"), observation.source.url);
}


function relationship(
  id: string,
  type: string,
  targetName: string,
  targetId: string,
  options: { status?: string; targetType?: string; anchor?: string; sourceField?: string } = {},
): ValidatedJson {
  return {
    relationship_id: id,
    type,
    target: {
      entity_type: options.targetType ?? "rule",
      entity_id: targetId,
      name: targetName,
    },
    status: options.status ?? "accepted",
    evidence: [{
      observation_id: "aon:test",
      source_field: options.sourceField ?? "spell_raw.description_raw",
      evidence_kind: "plain_text",
      anchor_text_raw: options.anchor ?? targetName,
      source_href: null,
    }],
    note: null,
  };
}


describe("rich-text schema and source parsing", () => {
  it("requires a valid document for canonical 0.2.0 records", () => {
    const Ajv2020 = Ajv2020Module as unknown as new (options: object) => {
      compile(schema: ValidatedJson): (value: unknown) => boolean;
    };
    const validate = new Ajv2020({ strict: false, formats: { uri: true } }).compile(
      loadJson(path.join(projectRoot, "schemas", "canonical-spell.schema.json")),
    );
    const pilot = canonical("restoration");
    expect(validate(pilot)).toBe(true);

    const missingDocument = structuredClone(pilot);
    delete missingDocument.description.document;
    expect(validate(missingDocument)).toBe(false);

    const invalidMark = structuredClone(pilot);
    const marked = invalidMark.description.document.content
      .flatMap((block: ValidatedJson) => block.content)
      .find((node: ValidatedJson) => node.marks);
    marked.marks = ["underline"];
    expect(validate(invalidMark)).toBe(false);

    const invalidList = structuredClone(canonical("bestow-curse"));
    const list = invalidList.description.document.content.find(
      (block: ValidatedJson) => block.node_type === "unordered_list",
    );
    list.content = [{ node_type: "paragraph", content: [] }];
    expect(validate(invalidList)).toBe(false);
  });

  it("parses pilot paragraphs, emphasis, lists, and hard breaks", () => {
    const restoration = parsedObservation("restoration/aon-0.1.6.json");
    const restorationDocument = parseRichTextHtml(restoration.descriptionHtml);
    expect(restorationDocument.content).toHaveLength(2);
    const restorationInlines = restorationDocument.content.flatMap((block) =>
      block.node_type === "paragraph"
        ? block.content
        : block.content.flatMap((item) => item.content)
    );
    expect(restorationInlines).toContainEqual({
      node_type: "text",
      value: "lesser restoration",
      marks: ["italic"],
    });

    const bestowCurse = parsedObservation("bestow-curse/aon-0.1.5.json");
    const bestowDocument = parseRichTextHtml(bestowCurse.descriptionHtml);
    const list = bestowDocument.content.find((block) => block.node_type === "unordered_list");
    expect(list?.content).toHaveLength(3);

    const breakDocument = parseRichTextHtml("first line<br>second line");
    expect(breakDocument.content[0]).toMatchObject({
      node_type: "paragraph",
      content: [
        { node_type: "text", value: "first line" },
        { node_type: "hard_break" },
        { node_type: "text", value: "second line" },
      ],
    });
  });

  it("keeps every rich-text document text-equivalent and linked only to accepted relationships", () => {
    const slugs = fs.readdirSync(path.join(projectRoot, "data", "canonical"))
      .filter((filename) => filename.endsWith(".json"))
      .map((filename) => filename.replace(/\.json$/, ""))
      .filter((slug) => canonical(slug).schema_version === "0.2.0");
    expect(slugs.length).toBeGreaterThanOrEqual(36);
    for (const slug of slugs) {
      const spell = canonical(slug);
      const document = spell.description.document as RichTextDocument;
      expect(spell.schema_version, slug).toBe("0.2.0");
      expect(comparableRichText(richTextLeafText(document)), slug)
        .toBe(comparableRichText(spell.description.raw));
      const relationships = new Map<string, ValidatedJson>(spell.relationships.map((item: ValidatedJson) => [
        item.relationship_id,
        item,
      ]));
      const links = document.content.flatMap((block) =>
        (block.node_type === "paragraph" ? block.content : block.content.flatMap((item) => item.content))
          .filter((node) => node.node_type === "entity_link")
      );
      for (const link of links) {
        if (link.node_type !== "entity_link") continue;
        const accepted = relationships.get(link.relationship_id);
        expect(accepted?.status, link.relationship_id).toBe("accepted");
        expect(accepted?.target.entity_id, link.relationship_id).toBeTruthy();
        expect(accepted?.target.entity_id, link.relationship_id).not.toBe(spell.spell_id);
      }
    }
  });

  it("keeps Mythic Darkness separate and disambiguates contextual rules links", () => {
    const darkness = canonical("darkness");
    const document = darkness.description.document as RichTextDocument;
    const serialized = JSON.stringify(document);
    const inlineNodes = document.content.flatMap((block) =>
      block.node_type === "paragraph"
        ? block.content
        : block.content.flatMap((item) => item.content)
    );
    const darknessLinks = inlineNodes.filter((node) =>
      node.node_type === "entity_link" && node.value.toLowerCase() === "darkness"
    );

    expect(darkness.description.raw).not.toContain("Mythic Darkness");
    expect(serialized).not.toContain("Mythic Darkness");
    expect(serialized).not.toContain("spell.darkness:references:spell.darkness");
    expect(darknessLinks).toHaveLength(2);
    expect(darknessLinks.map((link) => link.node_type === "entity_link" ? link.relationship_id : ""))
      .toEqual([
        "spell.darkness:has_descriptor:descriptor.darkness",
        "spell.darkness:uses_definition:illumination.darkness",
      ]);
    expect(inlineNodes.filter((node) =>
      node.node_type === "text" &&
      node.value.toLowerCase() === "darkness" &&
      node.marks?.includes("italic")
    )).toHaveLength(2);
    expect(darkness.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.darkness:has_mythic_variant:mythic-spell-variant.darkness",
    }));
    expect(darkness.relationships.map((item: ValidatedJson) => item.target.entity_id))
      .not.toEqual(expect.arrayContaining([
        "publication.pathfinder-rpg-mythic-adventures",
        "rule.human",
        "rule.mythic-adventures-pg-90",
        "rule.see-in-darkness",
        "rule.source",
      ]));
  });

  it("keeps Batch 18 spell-list metadata and semantic rejections distinct", () => {
    const craftersFortune = canonical("crafters-fortune");
    expect(craftersFortune.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.crafters-fortune:appears_on_spell_list:spell-list.artifice-domain",
      type: "appears_on_spell_list",
      status: "accepted",
    }));

    const creepingDoom = canonical("creeping-doom");
    expect(creepingDoom.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.creeping-doom:appears_on_spell_list:spell-list.jungle-domain",
      type: "appears_on_spell_list",
      status: "accepted",
    }));

    const creepingIce = canonical("creeping-ice");
    expect(creepingIce.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.creeping-ice:references:spell.slow",
      status: "rejected",
    }));

    const crimeOfOpportunity = canonical("crime-of-opportunity");
    expect(crimeOfOpportunity.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.crime-of-opportunity:functions_like:spell.crime-wave",
      type: "functions_like",
      status: "accepted",
    }));

    const createSoulGem = canonical("create-soul-gem");
    expect(createSoulGem.relationships.map((item: ValidatedJson) => item.target.entity_id))
      .not.toContain(createSoulGem.spell_id);
  });

  it("keeps Batch 19 inheritance and homonyms semantically distinct", () => {
    const cyclicReincarnation = canonical("cyclic-reincarnation");
    expect(cyclicReincarnation.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.cyclic-reincarnation:functions_like:spell.reincarnate",
      type: "functions_like",
      status: "accepted",
    }));

    const damnationOfMemory = canonical("damnation-of-memory");
    expect(damnationOfMemory.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.damnation-of-memory:uses_definition:rule.magic-aura-detection",
      type: "uses_definition",
      status: "accepted",
    }));
    expect(damnationOfMemory.relationships.map((item: ValidatedJson) => item.relationship_id))
      .not.toContain("spell.damnation-of-memory:references:spell.magic-aura");

    const curseOfDragonflies = canonical("curse-of-dragonflies");
    expect(curseOfDragonflies.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.curse-of-dragonflies:uses_definition:rule.medium",
      status: "rejected",
    }));

    const daemonWard = canonical("daemon-ward");
    expect(daemonWard.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.daemon-ward:uses_definition:rule.pathfinder-campaign-setting-horsemen-of-the-apocalypse-book-of-the-damned-vol-3",
      status: "rejected",
    }));
  });

  it("keeps Batch 20 spell, rule, and source-navigation meanings distinct", () => {
    const greaterDarkvision = canonical("darkvision-greater");
    const greaterDocument = JSON.stringify(greaterDarkvision.description.document);
    expect(greaterDocument.match(/functions_like:spell\.darkvision/g)).toHaveLength(1);
    expect(greaterDocument.match(/uses_definition:rule\.darkvision/g)).toHaveLength(1);

    const daywalker = canonical("daywalker");
    expect(daywalker.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.daywalker:uses_definition:rule.energy-drain",
      status: "accepted",
    }));
    for (const relationshipId of [
      "spell.daywalker:uses_definition:condition.dead",
      "spell.daywalker:uses_definition:rule.touch-attack",
      "spell.daywalker:uses_definition:rule.unholy-water",
    ]) {
      expect(daywalker.relationships).toContainEqual(expect.objectContaining({
        relationship_id: relationshipId,
        status: "rejected",
      }));
    }

    const deathCandle = canonical("death-candle");
    expect(deathCandle.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.death-candle:uses_definition:monster.fire-elemental",
      status: "accepted",
    }));
    expect(deathCandle.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.death-candle:uses_definition:rule.summon",
      status: "rejected",
    }));

    const greaterAura = canonical("death-knell-aura-greater");
    expect(greaterAura.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.death-knell-aura-greater:references:spell.magic-jar",
      status: "accepted",
    }));
    expect(greaterAura.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.death-knell-aura-greater:uses_definition:rule.pathfinder-campaign-setting-horsemen-of-the-apocalypse-book-of-the-damned-vol-3",
      status: "rejected",
    }));
  });

  it("keeps Batch 21 contextual darkness and spell-list navigation distinct", () => {
    const deeperDarkness = canonical("deeper-darkness");
    const document = JSON.stringify(deeperDarkness.description.document);
    expect(document.match(/functions_like:spell\.darkness/g)).toHaveLength(2);
    expect(document.match(/uses_definition:descriptor\.darkness/g)).toHaveLength(1);
    expect(document.match(/uses_definition:illumination\.darkness/g)).toHaveLength(2);
    expect(document).not.toContain("Deeper</a>");
    expect(deeperDarkness.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.deeper-darkness:appears_on_spell_list:spell-list.sorcerer-div-bloodline",
      status: "accepted",
    }));
    expect(deeperDarkness.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.deeper-darkness:appears_on_spell_list:spell-list.shadow-mystery",
      status: "accepted",
    }));

    const bloodSalvation = canonical("blood-salvation");
    expect(bloodSalvation.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.blood-salvation:uses_definition:rule.pathfinder-player-companion-advanced-class-origins",
      status: "rejected",
    }));

    const decollate = canonical("decollate");
    expect(decollate.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.decollate:uses_definition:condition.dead",
      status: "rejected",
    }));

    const delayedFireball = canonical("delayed-blast-fireball");
    expect(JSON.stringify(delayedFireball.description.document).match(
      /functions_like:spell\.fireball/g,
    )).toHaveLength(1);
  });
});


describe("rich-text relationship enrichment", () => {
  it("reconciles modifier-first spell names to canonical IDs", () => {
    const lesserRestoration = canonical("restoration-lesser");
    const available = new Map([[lesserRestoration.spell_id, lesserRestoration]]);
    expect(resolveCanonicalSpellReference(
      "lesser restoration",
      available,
      "spell.lesser-restoration",
    )?.spell_id).toBe("spell.restoration-lesser");
  });

  it("links repeated terms and chooses longest non-overlapping phrases", () => {
    const source = parseRichTextHtml("negative levels, negative level, and negative levels");
    const result = linkRichTextDocument(source, [
      relationship("spell.test:uses_definition:rule.negative-level", "uses_definition", "negative level", "rule.negative-level"),
      relationship("spell.test:uses_definition:rule.negative-levels", "uses_definition", "negative levels", "rule.negative-levels"),
    ]);
    const paragraph = result.document.content[0];
    const links = paragraph?.node_type === "paragraph"
      ? paragraph.content.filter((node) => node.node_type === "entity_link")
      : [];
    expect(links.map((node) => node.node_type === "entity_link" ? node.relationship_id : ""))
      .toEqual([
        "spell.test:uses_definition:rule.negative-levels",
        "spell.test:uses_definition:rule.negative-level",
        "spell.test:uses_definition:rule.negative-levels",
      ]);
  });

  it("links accepted casting actions when the metadata phrase appears in prose", () => {
    const source = parseRichTextHtml("You can dismiss the spell as an immediate action.");
    const result = linkRichTextDocument(source, [
      relationship(
        "spell.test:uses_action:action.immediate-action",
        "uses_action",
        "Immediate action",
        "action.immediate-action",
        { anchor: "immediate action", sourceField: "spell_raw.casting_time_raw" },
      ),
    ]);
    expect(JSON.stringify(result.document)).toContain(
      "spell.test:uses_action:action.immediate-action",
    );
    expect(result.warnings).toEqual([]);
  });

  it("uses relationship priority and leaves same-priority ambiguity unlinked", () => {
    const source = parseRichTextHtml("lesser restoration");
    const prioritized = linkRichTextDocument(source, [
      relationship("spell.test:references:spell.restoration-lesser", "references", "Restoration, Lesser", "spell.restoration-lesser", { targetType: "spell" }),
      relationship("spell.test:functions_like:spell.restoration-lesser", "functions_like", "Restoration, Lesser", "spell.restoration-lesser", { targetType: "spell" }),
    ]);
    expect(JSON.stringify(prioritized.document)).toContain("spell.test:functions_like:spell.restoration-lesser");
    expect(JSON.stringify(prioritized.document)).not.toContain("spell.test:references:spell.restoration-lesser");

    const ambiguous = linkRichTextDocument(parseRichTextHtml("curse"), [
      relationship("spell.test:uses_definition:rule.curse-a", "uses_definition", "curse", "rule.curse-a"),
      relationship("spell.test:uses_definition:rule.curse-b", "uses_definition", "curse", "rule.curse-b"),
    ]);
    expect(JSON.stringify(ambiguous.document)).not.toContain("entity_link");
    expect(ambiguous.warnings).toContainEqual(expect.objectContaining({
      code: "AMBIGUOUS_RICH_TEXT_LINK",
      phrase: "curse",
    }));
  });

  it("ignores rejected relationships and warns about accepted unmatched phrases", () => {
    const result = linkRichTextDocument(parseRichTextHtml("ordinary text"), [
      relationship("spell.test:uses_definition:rule.rejected", "uses_definition", "ordinary", "rule.rejected", { status: "rejected" }),
      relationship("spell.test:references:spell.missing", "references", "Missing Spell", "spell.missing", { targetType: "spell" }),
    ]);
    expect(JSON.stringify(result.document)).not.toContain("entity_link");
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "UNMATCHED_RICH_TEXT_LINK",
      relationship_ids: ["spell.test:references:spell.missing"],
    }));
  });

  it("does not turn classification metadata or self-references into description links", () => {
    const result = linkRichTextDocument(
      parseRichTextHtml("darkness and <i>darkness</i>"),
      [
        relationship(
          "spell.darkness:has_descriptor:descriptor.darkness",
          "has_descriptor",
          "darkness",
          "descriptor.darkness",
          { targetType: "descriptor", sourceField: "spell_raw.school_raw" },
        ),
        relationship(
          "spell.darkness:references:spell.darkness",
          "references",
          "Darkness",
          "spell.darkness",
          { targetType: "spell" },
        ),
      ],
      { ownerEntityId: "spell.darkness" },
    );

    expect(JSON.stringify(result.document)).not.toContain("entity_link");
  });

  it("preserves semantic case for single-word rules terms", () => {
    const result = linkRichTextDocument(
      parseRichTextHtml("A Knowledge check reveals knowledge about the subject."),
      [relationship(
        "spell.test:uses_definition:rule.knowledge",
        "uses_definition",
        "Knowledge",
        "rule.knowledge",
        { anchor: "Knowledge" },
      )],
    );
    const serialized = JSON.stringify(result.document);
    expect(serialized.match(/entity_link/g)).toHaveLength(1);
    expect(serialized).toContain('"value":"Knowledge"');
  });
});
