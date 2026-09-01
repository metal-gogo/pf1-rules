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
  richTextBlockInlines,
  richTextLeafText,
  type RichTextDocument,
} from "../src/domain/rich-text.js";
import { resolveCanonicalSpellReference } from "../src/ingestion/normalize-level-zero.js";
import { resolveArtifactPath } from "../src/ingestion/artifact-store.js";
import {
  sourceDescriptionMatch,
  syncDescriptionInheritanceOverrides,
} from "../src/ingestion/enrich-rich-text-pilot.js";
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
  const artifact = resolveArtifactPath(
    filename,
    observation.retrieval.raw_artifact_path,
    observation.retrieval.content_sha256,
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
  it("accepts a bounded AoN description with a separately stored mythic suffix", () => {
    expect(sourceDescriptionMatch("Base description", "Base description"))
      .toEqual({ exact: true, leakedMythicSuffix: false });
    expect(sourceDescriptionMatch(
      "Base description\n\nMythic Example\nMythic rules",
      "Base description",
    )).toEqual({ exact: false, leakedMythicSuffix: true });
    expect(sourceDescriptionMatch("Different description", "Base description"))
      .toEqual({ exact: false, leakedMythicSuffix: false });
  });

  it("keeps description inheritance overrides aligned with canonical text", () => {
    const spell = {
      description: { raw: "Base description" },
      rules_inheritance: [{
        overrides: [{ path: "/description/raw", value: "Base description\nMythic rules", raw: "source" }],
      }],
    } as ValidatedJson;

    syncDescriptionInheritanceOverrides(spell);

    expect(spell.rules_inheritance[0].overrides[0]).toEqual({
      path: "/description/raw",
      value: "Base description",
      raw: "source",
    });
  });

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
    const restorationInlines = restorationDocument.content.flatMap(richTextBlockInlines);
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

  it("preserves description headings and table structure", () => {
    const document = parseRichTextHtml(
      "<h2>Incarnations</h2><table><tr><td><b>d%</b></td><td><b>Form</b></td></tr>" +
      "<tr><td>01</td><td>Bugbear</td></tr></table>",
    );

    expect(document.content).toEqual([
      {
        node_type: "heading",
        level: 2,
        content: [{ node_type: "text", value: "Incarnations" }],
      },
      {
        node_type: "table",
        content: [
          {
            node_type: "table_row",
            content: [
              {
                node_type: "table_cell",
                header: true,
                content: [{ node_type: "text", value: "d%", marks: ["bold"] }],
              },
              {
                node_type: "table_cell",
                header: true,
                content: [{ node_type: "text", value: "Form", marks: ["bold"] }],
              },
            ],
          },
          {
            node_type: "table_row",
            content: [
              {
                node_type: "table_cell",
                header: false,
                content: [{ node_type: "text", value: "01" }],
              },
              {
                node_type: "table_cell",
                header: false,
                content: [{ node_type: "text", value: "Bugbear" }],
              },
            ],
          },
        ],
      },
    ]);
    expect(comparableRichText(richTextLeafText(document)))
      .toBe(comparableRichText("Incarnations d% Form 01 Bugbear"));
  });

  it("keeps Reincarnate's supplemental rules inside the bounded description", () => {
    const reincarnate = parsedObservation("reincarnate/aon-0.1.5.json");
    const document = parseRichTextHtml(reincarnate.descriptionHtml);

    expect(reincarnate.descriptionRaw).toContain("Reincarnation on Golarion");
    expect(document.content.filter((block) => block.node_type === "heading"))
      .toHaveLength(3);
    expect(document.content.filter((block) => block.node_type === "table"))
      .toHaveLength(3);
  });

  it("keeps mythic title sections outside the bounded base description", () => {
    const darkness = parsedObservation("darkness/aon-0.1.5.json");

    expect(darkness.descriptionRaw).not.toContain("Mythic Darkness");
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
      const links = document.content.flatMap(richTextBlockInlines)
        .filter((node) => node.node_type === "entity_link");
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
    const inlineNodes = document.content.flatMap(richTextBlockInlines);
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
        "race.human",
        "publication.mythic-adventures-pg-90",
        "universal-monster-rule.see-in-darkness",
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
        "spell.damnation-of-memory:uses_definition:aura.magic",
      type: "uses_definition",
      status: "accepted",
    }));
    expect(damnationOfMemory.relationships.map((item: ValidatedJson) => item.relationship_id))
      .not.toContain("spell.damnation-of-memory:references:spell.magic-aura");

    const curseOfDragonflies = canonical("curse-of-dragonflies");
    expect(curseOfDragonflies.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.curse-of-dragonflies:uses_definition:class.medium",
      status: "rejected",
    }));

    const daemonWard = canonical("daemon-ward");
    expect(daemonWard.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.daemon-ward:uses_definition:publication.pathfinder-campaign-setting-horsemen-of-the-apocalypse-book-of-the-damned-vol-3",
      status: "rejected",
    }));
  });

  it("keeps Batch 20 spell, rule, and source-navigation meanings distinct", () => {
    const greaterDarkvision = canonical("darkvision-greater");
    const greaterDocument = JSON.stringify(greaterDarkvision.description.document);
    expect(greaterDocument.match(/functions_like:spell\.darkvision/g)).toHaveLength(1);
    expect(greaterDocument.match(/uses_definition:special-ability\.darkvision/g)).toHaveLength(1);

    const daywalker = canonical("daywalker");
    expect(daywalker.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.daywalker:uses_definition:energy-drain",
      status: "accepted",
    }));
    for (const relationshipId of [
      "spell.daywalker:uses_definition:condition.dead",
      "spell.daywalker:uses_definition:attack.touch",
      "spell.daywalker:uses_definition:item.unholy-water",
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
      relationship_id: "spell.death-candle:uses_definition:universal-monster-rule.summon",
      status: "rejected",
    }));

    const greaterAura = canonical("death-knell-aura-greater");
    expect(greaterAura.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.death-knell-aura-greater:references:spell.magic-jar",
      status: "accepted",
    }));
    expect(greaterAura.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.death-knell-aura-greater:uses_definition:publication.pathfinder-campaign-setting-horsemen-of-the-apocalypse-book-of-the-damned-vol-3",
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
        "spell.blood-salvation:uses_definition:publication.pathfinder-player-companion-advanced-class-origins",
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

  it("keeps Batch 22 inheritance, source navigation, and verb phrases distinct", () => {
    const greaterDetectMagic = canonical("detect-magic-greater");
    expect(JSON.stringify(greaterDetectMagic.description.document).match(
      /functions_like:spell\.detect-magic/g,
    )).toHaveLength(1);

    const detectMindscape = canonical("detect-mindscape");
    expect(detectMindscape.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.detect-mindscape:functions_like:spell.detect-thoughts",
      status: "accepted",
    }));
    expect(detectMindscape.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.detect-mindscape:appears_on_spell_list:spell-list.medium",
      status: "accepted",
    }));

    const psychicSignificance = canonical("detect-psychic-significance");
    expect(psychicSignificance.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.detect-psychic-significance:references:spell.detect-magic",
      status: "rejected",
    }));
    expect(psychicSignificance.relationships).toContainEqual(expect.objectContaining({
      relationship_id:
        "spell.detect-psychic-significance:appears_on_spell_list:spell-list.medium",
      status: "accepted",
    }));

    const radiation = canonical("detect-radiation");
    expect(radiation.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.detect-radiation:uses_definition:universal-monster-rule.see-in-darkness",
      status: "rejected",
    }));

    const snares = canonical("detect-snares-and-pits");
    const snaresDocument = JSON.stringify(snares.description.document);
    expect(snaresDocument.match(/references:spell\.snare/g)).toHaveLength(1);
    expect(snares.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.detect-snares-and-pits:references:spell.detect-magic",
      status: "rejected",
    }));

    const greaterPublicationLinks = greaterDetectMagic.relationships.filter(
      (relationship: Record<string, unknown>) => [
        "spell.detect-magic-greater:uses_definition:publication.pathfinder-rpg-ultimate-intrigue",
        "spell.detect-magic-greater:uses_definition:publication.pathfinder-rpg-ultimate-intrigue",
      ].includes(String(relationship.relationship_id)),
    );
    expect(greaterPublicationLinks).toHaveLength(1);
    expect(greaterPublicationLinks.every(
      (relationship: Record<string, unknown>) => relationship.status === "rejected",
    )).toBe(true);
  });

  it("keeps Batch 23 contextual rules and parent-spell references distinct", () => {
    const greaterDischarge = canonical("discharge-greater");
    expect(JSON.stringify(greaterDischarge.description.document).match(
      /functions_like:spell\.discharge/g,
    )).toHaveLength(3);

    const diminishResistance = canonical("diminish-resistance");
    const resistanceDocument = JSON.stringify(diminishResistance.description.document);
    expect(resistanceDocument).not.toContain("references:spell.resistance");
    for (const descriptor of ["acid", "cold", "electricity", "fire", "sonic"]) {
      expect(resistanceDocument).toContain(`uses_definition:descriptor.${descriptor}`);
    }

    for (const slug of ["determine-depth", "devil-snare", "dispel-balance"]) {
      const document = JSON.stringify(canonical(slug).description.document);
      expect(document).not.toContain('"value":"touch","relationship_id"');
    }

    const discoveryTorch = JSON.stringify(canonical("discovery-torch").description.document);
    expect(discoveryTorch).toContain("uses_definition:illumination.bright-light");
    expect(discoveryTorch).toContain("uses_definition:descriptor.light");
    expect(discoveryTorch).toContain("uses_definition:descriptor.darkness");

    const disguiseWeapon = JSON.stringify(canonical("disguise-weapon").description.document);
    for (const item of ["greatsword", "quarterstaff", "club", "dagger"]) {
      expect(disguiseWeapon).toContain(`uses_definition:item.${item}`);
    }
  });

  it("keeps Batch 24 contextual spell, rules, and class links distinct", () => {
    const disruptSilence = JSON.stringify(canonical("disrupt-silence").description.document);
    expect(disruptSilence.match(/references:spell\.silence/g)).toHaveLength(1);

    for (const slug of ["disrupt-link", "dissolution"]) {
      const document = JSON.stringify(canonical(slug).description.document);
      expect(document).not.toContain('"value":"touch","relationship_id"');
    }

    const displacement = JSON.stringify(canonical("displacement").description.document);
    expect(displacement.match(/uses_definition:concealment\.total/g)).toHaveLength(2);
    expect(displacement).not.toContain('uses_definition:concealment"');

    const divinePower = JSON.stringify(canonical("divine-power").description.document);
    expect(divinePower).toContain("uses_definition:weapon-special-ability.speed-weapon");
    expect(divinePower).not.toContain('"relationship_id":"spell.divine-power:uses_definition:movement.speed"');

    const divineVessel = JSON.stringify(canonical("divine-vessel").description.document);
    expect(divineVessel.match(/uses_definition:descriptor\.cold/g)).toHaveLength(3);
    expect(divineVessel.match(/uses_definition:creature-subtype\.good/g)).toHaveLength(3);

    const dominateAnimal = JSON.stringify(canonical("dominate-animal").description.document);
    expect(dominateAnimal.match(/uses_definition:monster-type\.animal/g)).toHaveLength(4);
    expect(dominateAnimal).toContain('"node_type":"text","value":"animal","marks":["italic"]');

    const draconicAlly = JSON.stringify(canonical("draconic-ally").description.document);
    for (const target of [
      "class.inquisitor",
      "class.warpriest",
      "deity.apsu",
      "deity.dahak",
    ]) expect(draconicAlly).toContain(`uses_definition:${target}`);
  });

  it("keeps Batch 25 tables, homonyms, and canonical destinations distinct", () => {
    const ceremony = JSON.stringify(canonical("ceremony").description.document);
    expect(ceremony.match(/uses_definition:attack\.touch/g)).toHaveLength(3);
    for (const target of [
      "descriptor.air",
      "descriptor.earth",
      "descriptor.fire",
      "descriptor.light",
      "descriptor.water",
      "bonus.profane",
      "creature-subtype.swarm",
    ]) expect(ceremony).toContain(`uses_definition:${target}`);
    for (const descriptor of ["air", "earth", "fire", "light", "water"]) {
      expect(ceremony.match(new RegExp(`uses_definition:descriptor\\.${descriptor}`, "g")))
        .toHaveLength(1);
    }

    const detectUndead = canonical("detect-undead");
    expect(detectUndead.description.document.content.filter(
      (block: Record<string, unknown>) => block.node_type === "table",
    )).toHaveLength(1);
    expect(canonical("curse-terrain-lesser").description.document.content.filter(
      (block: Record<string, unknown>) => block.node_type === "table",
    )).toHaveLength(1);
    expect(JSON.stringify(detectUndead.description.document).match(
      /uses_definition:monster-type\.undead/g,
    )).toHaveLength(9);

    for (const slug of ["drain-poison", "dream-voyage"]) {
      const spell = canonical(slug);
      expect(spell.relationships).toContainEqual(expect.objectContaining({
        relationship_id: `spell.${slug}:uses_definition:attack.touch`,
        status: "rejected",
      }));
      expect(JSON.stringify(spell.description.document)).not.toContain(
        `spell.${slug}:uses_definition:attack.touch`,
      );
    }

    expect(JSON.stringify(canonical("dream-council").description.document).match(
      /functions_like:spell\.dream/g,
    )).toHaveLength(3);
    expect(JSON.stringify(canonical("dream-scan").description.document).match(
      /functions_like:spell\.dream/g,
    )).toHaveLength(2);
    expect(JSON.stringify(canonical("dream-travel").description.document).match(
      /references:spell\.dream"/g,
    )).toHaveLength(1);

    expect(JSON.stringify(canonical("dragon-turtle-shell").description.document))
      .toContain("uses_definition:feat.improved-natural-attack");
    expect(JSON.stringify(canonical("dungeonsight").description.document))
      .toContain("uses_definition:monster.iron-golem");
  });

  it("keeps Batch 26 spell references, homonyms, and elemental contexts distinct", () => {
    const enclosure = JSON.stringify(
      canonical("echeans-excellent-enclosure").description.document,
    );
    for (const spell of [
      "antimagic-field",
      "dimension-door",
      "dispel-magic",
      "teleport",
      "wall-of-force",
    ]) expect(enclosure).toContain(`spell.${spell}`);

    const snare = canonical("ectoplasmic-snare");
    expect(snare.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.ectoplasmic-snare:references:spell.snare",
      status: "rejected",
    }));
    expect(JSON.stringify(snare.description.document)).not.toContain("references:spell.snare");

    const aura = JSON.stringify(canonical("elemental-aura").description.document);
    expect(aura).not.toContain("uses_definition:creature-subtype.elemental");
    for (const descriptor of ["acid", "cold", "electricity", "fire"]) {
      expect(aura).toContain(`uses_definition:descriptor.${descriptor}`);
    }

    const speech = JSON.stringify(canonical("elemental-speech").description.document);
    expect(speech.match(/uses_definition:creature-subtype\.elemental/g)).toHaveLength(2);
    for (const element of ["air", "earth", "fire", "water"]) {
      expect(speech).toContain(`uses_definition:descriptor.${element}`);
      expect(speech).toContain(`uses_definition:creature-subtype.${element}`);
    }

    expect(canonical("elemental-mastery").description.document.content.filter(
      (block: Record<string, unknown>) => block.node_type === "table",
    )).toHaveLength(1);
    expect(JSON.stringify(canonical("eaglesoul").description.document))
      .toContain("uses_definition:special-ability.energy-resistance");
    for (const tier of ["ii", "iii", "iv", "v"]) {
      expect(JSON.stringify(canonical(`ego-whip-${tier}`).description.document))
        .toContain("functions_like:spell.ego-whip-i");
    }
  });

  it("keeps Batch 27 planes, subtypes, titles, and attitudes distinct", () => {
    const swarm = canonical("elemental-swarm");
    const swarmDocument = JSON.stringify(swarm.description.document);
    expect(swarmDocument.match(/uses_definition:creature-subtype\.elemental/g)).toHaveLength(7);
    expect(swarmDocument).toContain('"node_type":"text","value":"Elemental"');
    for (const subtype of ["air", "earth", "fire", "water"]) {
      expect(swarmDocument).toContain(`uses_definition:creature-subtype.${subtype}`);
    }
    expect(swarm.relationships).toContainEqual(expect.objectContaining({
      relationship_id: "spell.elemental-swarm:uses_definition:descriptor.fire",
      status: "rejected",
    }));

    const greed = JSON.stringify(canonical("emblem-of-greed").description.document);
    expect(greed).toContain("references:spell.greater-magic-weapon");
    expect(greed).not.toContain("uses_definition:spell.greater-magic-weapon");

    const sight = JSON.stringify(canonical("enchantment-sight").description.document);
    expect(sight.match(/uses_definition:magic-school\.enchantment/g)).toHaveLength(4);
    expect(sight).toContain('"node_type":"text","value":"Enchantment","marks":["italic"]');

    const siege = JSON.stringify(canonical("energy-siege-shot").description.document);
    for (const descriptor of ["acid", "cold", "electricity", "fire", "force", "sonic"]) {
      expect(siege).toContain(`uses_definition:descriptor.${descriptor}`);
    }
    expect(siege).toContain("uses_definition:condition.deaf");
    expect(siege).not.toContain("uses_definition:condition.deafened");

    expect(JSON.stringify(canonical("enthrall").description.document).match(
      /uses_definition:skill\.attitude/g,
    )).toHaveLength(6);
    expect(JSON.stringify(canonical("enemys-heart").description.document))
      .toContain("functions_like:spell.death-knell");
    expect(JSON.stringify(canonical("enlightened-step").description.document))
      .toContain("functions_like:spell.air-walk");
    expect(JSON.stringify(canonical("enhance-water").description.document))
      .toContain("uses_definition:item.unholy-water");
  });

  it("keeps Batch 28 rules terms distinct from ordinary verbs and state nouns", () => {
    const alarm = JSON.stringify(canonical("escape-alarm").description.document);
    expect(alarm.match(/functions_like:spell\.alarm/g)).toHaveLength(1);
    expect(alarm).toContain("uses_definition:spellcasting.caster-level");

    const fists = canonical("ethereal-fists");
    const fistsDocument = JSON.stringify(fists.description.document);
    expect(fistsDocument).not.toContain("references:spell.etherealness");
    expect(fistsDocument.match(/uses_definition:special-ability\.ethereal"/g)).toHaveLength(2);
    expect(fistsDocument).toContain("uses_definition:plane.ethereal");
    expect(fistsDocument).toContain("uses_definition:plane.material");
    expect(fistsDocument).toContain("uses_definition:weapon.strike-unarmed");

    const lens = JSON.stringify(canonical("evaluators-lens").description.document);
    expect(lens).toContain("uses_definition:subschool.figment");
    expect(lens).not.toContain("uses_definition:magic-school.illusion.figment");
    expect(lens).toContain("uses_definition:item.rod-of-cancellation");
    expect(lens).toContain("uses_definition:magic-item.artifact.artifact");

    const tranquility = JSON.stringify(canonical("euphoric-tranquility").description.document);
    expect(tranquility).toContain('"value":"Helpful","relationship_id":"spell.euphoric-tranquility:uses_definition:skill.attitude"');

    const shards = canonical("etheric-shards");
    expect(JSON.stringify(shards.description.document)).not.toContain(
      "uses_definition:condition.disabled",
    );
    for (const [slug, relationshipId] of [
      ["ether-step", "spell.ether-step:uses_definition:bonus.dodge"],
      ["ethereal-envelope", "spell.ethereal-envelope:uses_definition:condition.broken"],
      ["ethereal-fists", "spell.ethereal-fists:references:spell.etherealness"],
      ["etheric-shards", "spell.etheric-shards:uses_definition:condition.broken"],
      ["etheric-shards", "spell.etheric-shards:uses_definition:condition.disabled"],
    ] as const) {
      expect(canonical(slug).relationships).toContainEqual(expect.objectContaining({
        relationship_id: relationshipId,
        status: "rejected",
      }));
    }
  });

  it("keeps Batch 29 abilities, spell inheritance, and scrying semantics distinct", () => {
    const blood = canonical("expel-blood");
    const bloodDocument = JSON.stringify(blood.description.document);
    expect(bloodDocument).not.toContain("references:spell.vortex");
    expect(bloodDocument.match(/uses_definition:monster\.water-elemental"/g)).toHaveLength(7);

    const runes = JSON.stringify(canonical("explosive-runes").description.document);
    expect(runes.match(/references:spell\.erase/g)).toHaveLength(1);
    for (const target of [
      "descriptor.force",
      "skill.disable-device",
      "skill.perception",
      "trap.trap",
      "class-feature.trapfinding",
    ]) expect(runes).toContain(`uses_definition:${target}`);

    const accompaniment = JSON.stringify(canonical("exquisite-accompaniment").description.document);
    expect(accompaniment).not.toContain("references:spell.teleport");
    expect(accompaniment.match(/class-feature\.bardic-performance/g)).toHaveLength(3);

    expect(JSON.stringify(canonical("fairy-ring-retreat").description.document))
      .toContain("functions_like:spell.unseen-servant");
    expect(JSON.stringify(canonical("false-belief").description.document))
      .toContain("functions_like:spell.modify-memory");

    for (const slug of ["false-vision", "false-vision-greater"]) {
      const document = JSON.stringify(canonical(slug).description.document);
      expect(document).toContain("uses_definition:subschool.scrying");
      expect(document).not.toContain("references:spell.scrying");
    }
    expect(JSON.stringify(canonical("false-vision-greater").description.document))
      .toContain("functions_like:spell.false-vision");

    const resurrection = JSON.stringify(canonical("false-resurrection-greater").description.document);
    expect(resurrection.match(/functions_like:spell\.false-resurrection/g)).toHaveLength(2);

    const tapestry = canonical("fable-tapestry").description.document;
    expect(tapestry.content.filter(
      (block: Record<string, unknown>) => block.node_type === "table",
    )).toHaveLength(1);

    for (const [slug, relationshipId] of [
      ["expel-blood", "spell.expel-blood:references:spell.vortex"],
      ["exquisite-accompaniment", "spell.exquisite-accompaniment:references:spell.teleport"],
      ["fairy-ring-retreat", "spell.fairy-ring-retreat:uses_definition:monster-type.animal"],
    ] as const) {
      expect(canonical(slug).relationships).toContainEqual(expect.objectContaining({
        relationship_id: relationshipId,
        status: "rejected",
      }));
    }
  });

  it("keeps Batch 30 form abilities and afflictions distinct from spells", () => {
    const melding = JSON.stringify(canonical("familiar-melding").description.document);
    expect(melding).not.toContain("uses_definition:condition.dead");

    for (const slug of ["fey-form-ii", "fey-form-iii", "fey-form-iv"]) {
      expect(JSON.stringify(canonical(slug).description.document))
        .not.toContain("references:spell.blood-rage");
    }
    for (const slug of ["fey-form-iii", "fey-form-iv"]) {
      expect(JSON.stringify(canonical(slug).description.document))
        .not.toContain("references:spell.resistance");
    }

    const fieryBody = JSON.stringify(canonical("fiery-body").description.document);
    expect(fieryBody).not.toContain("references:spell.poison");
    expect(fieryBody).toContain("uses_definition:concealment");

    for (const [slug, relationshipId] of [
      ["familiar-melding", "spell.familiar-melding:uses_definition:condition.dead"],
      ["fey-form-ii", "spell.fey-form-ii:references:spell.blood-rage"],
      ["fey-form-iii", "spell.fey-form-iii:references:spell.blood-rage"],
      ["fey-form-iii", "spell.fey-form-iii:references:spell.resistance"],
      ["fey-form-iv", "spell.fey-form-iv:references:spell.blood-rage"],
      ["fey-form-iv", "spell.fey-form-iv:references:spell.resistance"],
      ["fiery-body", "spell.fiery-body:references:spell.poison"],
    ] as const) {
      expect(canonical(slug).relationships).toContainEqual(expect.objectContaining({
        relationship_id: relationshipId,
        status: "rejected",
      }));
    }
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
      relationship("spell.test:uses_definition:special-ability.negative-level", "uses_definition", "negative level", "special-ability.negative-level"),
      relationship("spell.test:uses_definition:special-ability.negative-levels", "uses_definition", "negative levels", "special-ability.negative-levels"),
    ]);
    const paragraph = result.document.content[0];
    const links = paragraph?.node_type === "paragraph"
      ? paragraph.content.filter((node) => node.node_type === "entity_link")
      : [];
    expect(links.map((node) => node.node_type === "entity_link" ? node.relationship_id : ""))
      .toEqual([
        "spell.test:uses_definition:special-ability.negative-levels",
        "spell.test:uses_definition:special-ability.negative-level",
        "spell.test:uses_definition:special-ability.negative-levels",
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

  it("links spell references followed by the Ultimate Magic source abbreviation", () => {
    const result = linkRichTextDocument(parseRichTextHtml("anticipate perilUM"), [
      relationship(
        "spell.test:references:spell.anticipate-peril",
        "references",
        "Anticipate Peril",
        "spell.anticipate-peril",
        { targetType: "spell" },
      ),
    ]);
    expect(JSON.stringify(result.document)).toContain(
      "spell.test:references:spell.anticipate-peril",
    );
    expect(result.warnings).toEqual([]);
  });

  it("links terminal Roman, Arabic, and level-one series-name variants", () => {
    const result = linkRichTextDocument(parseRichTextHtml("summon monster I, summon monster 1, and summon monster"), [
      relationship(
        "spell.test:references:spell.summon-monster-1",
        "references",
        "Summon Monster 1",
        "spell.summon-monster-1",
        { targetType: "spell" },
      ),
    ]);
    expect(JSON.stringify(result.document)).toContain(
      "spell.test:references:spell.summon-monster-1",
    );
    expect(JSON.stringify(result.document).match(/spell\.test:references:spell\.summon-monster-1/g)).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it("links published spell-name and apostrophe variants", () => {
    const result = linkRichTextDocument(
      parseRichTextHtml("As create lesser demiplane and bull’s strength."),
      [
        relationship(
          "spell.test:functions_like:spell.create-demiplane-lesser",
          "functions_like",
          "Create Demiplane, Lesser",
          "spell.create-demiplane-lesser",
          { targetType: "spell" },
        ),
        relationship(
          "spell.test:functions_like:spell.bulls-strength",
          "functions_like",
          "Bull's Strength",
          "spell.bulls-strength",
          { targetType: "spell" },
        ),
      ],
    );
    expect(JSON.stringify(result.document)).toContain(
      "spell.test:functions_like:spell.create-demiplane-lesser",
    );
    expect(JSON.stringify(result.document)).toContain(
      "spell.test:functions_like:spell.bulls-strength",
    );
    expect(result.warnings).toEqual([]);
  });

  it("preserves superscript source abbreviations", () => {
    const document = parseRichTextHtml("anticipate peril<sup>UM</sup>");
    expect(document.content[0]).toMatchObject({
      node_type: "paragraph",
      content: [
        { node_type: "text", value: "anticipate peril" },
        { node_type: "text", value: "UM", marks: ["superscript"] },
      ],
    });
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

  it("does not warn when a source-only spell relationship is absent from the description", () => {
    const result = linkRichTextDocument(parseRichTextHtml("ordinary text"), [
      relationship(
        "spell.test:references:spell.missing",
        "references",
        "Missing Spell",
        "spell.missing",
        { targetType: "spell", sourceField: "spell_raw.links_raw[0]" },
      ),
    ]);
    expect(result.warnings).toEqual([]);
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
        "spell.test:uses_definition:skill.knowledge",
        "uses_definition",
        "Knowledge",
        "skill.knowledge",
        { anchor: "Knowledge" },
      )],
    );
    const serialized = JSON.stringify(result.document);
    expect(serialized.match(/entity_link/g)).toHaveLength(1);
    expect(serialized).toContain('"value":"Knowledge"');
  });
});
